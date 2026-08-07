import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  BrowserRuntime,
  BrowserRuntimeError,
  registerBrowserTools,
} from "../../packages/browser-runtime/dist/index.js";
import {
  PlaywrightAdapterError,
  resolveChromiumExecutable,
} from "../../packages/browser-playwright/dist/index.js";
import { ToolRegistry } from "../../packages/tool-runtime/dist/index.js";

const toolContext = (runId = "run-1", attemptId = "attempt-1") => ({
  runId,
  attemptId,
  workspaceId: "workspace-1",
  conversationId: "conversation-1",
  toolCallId: `${runId}-tool`,
});

class ObservationPage {
  id = "adapter-page";
  url = "about:blank";
  documentGeneration = 1;
  closed = false;
  navigationListeners = new Set();
  popupListeners = new Set();
  downloadListeners = new Set();
  async navigate(url) {
    this.url = url;
    this.documentGeneration += 1;
    for (const listener of this.navigationListeners) {
      listener({ url, documentGeneration: this.documentGeneration });
    }
    return { url };
  }
  currentUrl() { return this.url; }
  async title() { return `Fixture ${this.documentGeneration}`; }
  async snapshot() {
    return {
      documentGeneration: this.documentGeneration,
      url: this.url,
      title: `Fixture ${this.documentGeneration}`,
      text: `Fixture body ${this.documentGeneration}`,
      elements: [
        { elementId: `button:${this.documentGeneration}`, role: "button", name: "Continue", interactive: true },
        { elementId: `heading:${this.documentGeneration}`, role: "heading", name: "Fixture", interactive: false },
      ],
      truncated: false,
    };
  }
  async close() { this.closed = true; }
  onPopup(listener) { this.popupListeners.add(listener); return () => this.popupListeners.delete(listener); }
  onDownload(listener) { this.downloadListeners.add(listener); return () => this.downloadListeners.delete(listener); }
  onMainFrameNavigated(listener) { this.navigationListeners.add(listener); return () => this.navigationListeners.delete(listener); }
}

class ObservationContext {
  id = "adapter-context";
  page = new ObservationPage();
  async newPage() { return this.page; }
  async close() { this.closed = true; }
}

class ObservationProcess {
  id = "adapter-process";
  context = new ObservationContext();
  listeners = new Set();
  async createContext(options) {
    assert.equal(options.acceptDownloads, true);
    assert.equal(options.persistentStorage, false);
    return this.context;
  }
  async close() { this.closed = true; }
  onDisconnected(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}

class ObservationDriver {
  process = new ObservationProcess();
  async launch(options) {
    assert.equal(options.headless, true);
    assert.equal(options.timeoutMs, 2_000);
    return this.process;
  }
  async dispose() { this.disposed = true; }
}

function runtimeAndTools(driver = new ObservationDriver()) {
  let id = 0;
  const runtime = new BrowserRuntime({
    driver,
    headless: true,
    limits: {
      maxSessions: 2,
      maxPagesPerSession: 4,
      launchTimeoutMs: 2_000,
      actionTimeoutMs: 2_000,
      idleTimeoutMs: 60_000,
      sweepIntervalMs: 60_000,
    },
    policy: {
      navigation: { allowPrivateNetwork: false, allowedHostnames: [] },
      popup: "DENY",
      download: "EXPLICIT_ARTIFACT_ONLY",
      persistentStorage: "DENY",
      dialog: "BLOCK_AND_DISMISS",
    },
    createId: () => `runtime-${++id}`,
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
  });
  const tools = new ToolRegistry();
  registerBrowserTools(tools, runtime);
  return { runtime, tools };
}

test("STEP013B1 retains its six small closed Browser Tool schemas", () => {
  const { runtime, tools } = runtimeAndTools();
  const names = tools.definitions().map((definition) => definition.name);
  assert.deepEqual(names.filter((name) => [
    "browser.close",
    "browser.list",
    "browser.navigate",
    "browser.open",
    "browser.snapshot",
    "browser.status",
  ].includes(name)), [
    "browser.close",
    "browser.list",
    "browser.navigate",
    "browser.open",
    "browser.snapshot",
    "browser.status",
  ]);
  for (const definition of tools.definitions()) {
    assert.equal(definition.inputSchema.type, "object");
    assert.equal(definition.inputSchema.additionalProperties, false);
  }
  return runtime.close();
});

test("snapshot refs remain stable inside one document and become stale after navigation", async () => {
  const { runtime, tools } = runtimeAndTools();
  try {
    const opened = await tools.execute("browser.open", {}, toolContext());
    assert.equal(opened.isError, false);
    const page = opened.output;
    const first = await tools.execute("browser.snapshot", { sessionId: page.sessionId, pageId: page.pageId }, toolContext());
    const second = await tools.execute("browser.snapshot", { sessionId: page.sessionId, pageId: page.pageId }, toolContext());
    assert.equal(first.isError, false);
    assert.equal(first.output.documentGeneration, 1);
    assert.equal(first.output.elements[0].ref, second.output.elements[0].ref);
    const oldRef = first.output.elements[0].ref;
    assert.equal(runtime.assertElementRefCurrent(page.sessionId, page.pageId, oldRef), "button:1");

    const navigated = await tools.execute(
      "browser.navigate",
      { sessionId: page.sessionId, pageId: page.pageId, url: "https://example.com/next" },
      toolContext(),
    );
    assert.equal(navigated.isError, false);
    assert.equal(navigated.output.documentGeneration, 2);
    assert.throws(
      () => runtime.assertElementRefCurrent(page.sessionId, page.pageId, oldRef),
      (error) => error instanceof BrowserRuntimeError && error.code === "BROWSER_STALE_REF",
    );

    const fresh = await tools.execute("browser.snapshot", { sessionId: page.sessionId, pageId: page.pageId }, toolContext());
    assert.equal(fresh.output.documentGeneration, 2);
    assert.notEqual(fresh.output.elements[0].ref, oldRef);
    assert.equal(fresh.output.elements[0].ref, "e2-1");
  } finally {
    await runtime.close();
  }
});

test("Browser Tool ownership hides another Run attempt's session identifiers", async () => {
  const { runtime, tools } = runtimeAndTools();
  try {
    const opened = await tools.execute("browser.open", {}, toolContext("run-a", "attempt-a"));
    const page = opened.output;
    const foreign = await tools.execute(
      "browser.list",
      { sessionId: page.sessionId },
      toolContext("run-b", "attempt-b"),
    );
    assert.equal(foreign.isError, true);
    assert.equal(foreign.output.error.code, "BROWSER_SESSION_NOT_FOUND");
    const own = await tools.execute("browser.list", {}, toolContext("run-a", "attempt-a"));
    assert.equal(own.output.sessions.length, 1);
    assert.equal(own.output.sessions[0].pages.length, 1);
  } finally {
    await runtime.close();
  }
});

test("restricted Chromium discovery honors explicit path then PATH and fails closed", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step013b1-executable-"));
  try {
    const explicit = join(root, "explicit-chromium");
    const pathCandidate = join(root, "chromium");
    await writeFile(explicit, "fixture", "utf8");
    await writeFile(pathCandidate, "fixture", "utf8");
    await chmod(explicit, 0o755);
    await chmod(pathCandidate, 0o755);
    assert.deepEqual(resolveChromiumExecutable({ executablePath: explicit, env: { PATH: root }, platform: "linux" }), {
      executablePath: explicit,
      source: "explicit",
    });
    assert.deepEqual(resolveChromiumExecutable({ env: { PATH: root }, platform: "linux" }), {
      executablePath: pathCandidate,
      source: "path",
    });
    assert.throws(
      () => resolveChromiumExecutable({ env: { PATH: "" }, platform: "win32" }),
      (error) => error instanceof PlaywrightAdapterError && error.code === "OPENRILL_CHROMIUM_EXECUTABLE_NOT_FOUND",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


test("adapter launch diagnostics survive provider-neutral Browser failure wrapping", async () => {
  const failure = Object.assign(new Error("playwright-core 1.62.0 is required; run pnpm install --frozen-lockfile"), {
    code: "OPENRILL_PLAYWRIGHT_CORE_UNAVAILABLE",
  });
  const { runtime, tools } = runtimeAndTools({
    async launch() { throw failure; },
    async dispose() {},
  });
  try {
    const opened = await tools.execute("browser.open", {}, toolContext());
    assert.equal(opened.isError, true);
    assert.equal(opened.output.error.code, "BROWSER_LAUNCH_FAILED");
    assert.match(opened.output.error.message, /OPENRILL_PLAYWRIGHT_CORE_UNAVAILABLE/);
    assert.match(opened.output.error.message, /pnpm install --frozen-lockfile/);
  } finally {
    await runtime.close();
  }
});
