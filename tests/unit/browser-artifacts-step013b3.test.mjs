import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BrowserRuntime, registerBrowserTools } from "../../packages/browser-runtime/dist/index.js";
import { createWorkspaceArtifactStore } from "../../packages/tools-files/dist/index.js";
import { ToolRegistry } from "../../packages/tool-runtime/dist/index.js";

const context = {
  runId: "run-b3", attemptId: "attempt-b3", workspaceId: "workspace-b3",
  conversationId: "conversation-b3", toolCallId: "tool-b3",
};

class ArtifactPage {
  id = "adapter-page";
  url = "about:blank";
  documentGeneration = 1;
  downloadCalls = 0;
  navigationListeners = new Set();
  popupListeners = new Set();
  downloadListeners = new Set();
  async navigate(url) {
    this.url = url;
    this.documentGeneration += 1;
    for (const listener of this.navigationListeners) listener({ url, documentGeneration: this.documentGeneration });
    return { url };
  }
  currentUrl() { return this.url; }
  async title() { return `Fixture ${this.documentGeneration}`; }
  async snapshot() {
    return {
      documentGeneration: this.documentGeneration, url: this.url, title: `Fixture ${this.documentGeneration}`,
      text: "Browser Artifact fixture",
      elements: [{ elementId: `download:${this.documentGeneration}`, role: "link", name: "Download", interactive: true }],
      truncated: false,
    };
  }
  async act() { return { documentGeneration: this.documentGeneration, url: this.url, navigated: false }; }
  async screenshot(format, { maxBytes }) {
    const bytes = Uint8Array.from([137, 80, 78, 71]);
    if (bytes.byteLength > maxBytes) throw Object.assign(new Error(`screenshot exceeded ${maxBytes}`), { code: "OPENRILL_PLAYWRIGHT_SCREENSHOT_TOO_LARGE" });
    return { documentGeneration: this.documentGeneration, url: this.url, title: await this.title(), format, bytes };
  }
  async download(elementId, { maxBytes }) {
    this.downloadCalls += 1;
    assert.equal(elementId, `download:${this.documentGeneration}`);
    const bytes = Buffer.from("bounded-download", "utf8");
    if (bytes.byteLength > maxBytes) throw Object.assign(new Error(`download exceeded ${maxBytes}`), { code: "OPENRILL_PLAYWRIGHT_DOWNLOAD_TOO_LARGE" });
    return {
      documentGeneration: this.documentGeneration,
      url: "https://example.com/file?token=fixture",
      suggestedFilename: "../source.json",
      bytes,
    };
  }
  async evidence({ afterSequence, limit }) {
    const all = [
      { sequence: 1, at: 10, kind: "console", level: "log", text: "hello" },
      { sequence: 2, at: 20, kind: "page_error", name: "Error", message: "boom" },
      { sequence: 3, at: 30, kind: "network", method: "GET", url: "https://example.com/api?redacted", resourceType: "fetch", status: 404, ok: false },
    ];
    const available = all.filter((event) => event.sequence > afterSequence);
    const events = available.slice(0, limit);
    return { nextSequence: events.at(-1)?.sequence ?? afterSequence, truncated: available.length > events.length, events };
  }
  async close() {}
  onPopup(listener) { this.popupListeners.add(listener); return () => this.popupListeners.delete(listener); }
  onDownload(listener) { this.downloadListeners.add(listener); return () => this.downloadListeners.delete(listener); }
  onMainFrameNavigated(listener) { this.navigationListeners.add(listener); return () => this.navigationListeners.delete(listener); }
}

class ArtifactContext { id = "adapter-context"; page = new ArtifactPage(); async newPage() { return this.page; } async close() {} }
class ArtifactProcess {
  id = "adapter-process"; context = new ArtifactContext(); listeners = new Set();
  async createContext(options) { assert.equal(options.acceptDownloads, true); assert.equal(options.persistentStorage, false); return this.context; }
  async close() {}
  onDisconnected(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
}
class ArtifactDriver { process = new ArtifactProcess(); async launch() { return this.process; } async dispose() {} }

async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "openrill-step013b3-"));
  const metadata = [];
  let artifactId = 0;
  const artifacts = createWorkspaceArtifactStore({
    rootDirectory: root,
    createId: () => `artifact-${++artifactId}`,
    metadataSink: { recordArtifact: (value) => metadata.push(value) },
  });
  const driver = new ArtifactDriver();
  let runtimeId = 0;
  const runtime = new BrowserRuntime({
    driver,
    artifacts,
    headless: true,
    limits: { maxSessions: 1, maxPagesPerSession: 2, launchTimeoutMs: 1_000, actionTimeoutMs: 1_000, idleTimeoutMs: 60_000, sweepIntervalMs: 60_000 },
    policy: {
      navigation: { allowPrivateNetwork: false, allowedHostnames: [] }, popup: "DENY",
      download: "EXPLICIT_ARTIFACT_ONLY", persistentStorage: "DENY", dialog: "BLOCK_AND_DISMISS",
    },
    lookup: async () => [{ address: "93.184.216.34", family: 4 }],
    createId: () => `runtime-${++runtimeId}`,
    ...(options.outputLimits ? { outputLimits: options.outputLimits } : {}),
  });
  const tools = new ToolRegistry();
  registerBrowserTools(tools, runtime);
  return { root, metadata, driver, runtime, tools };
}

test("STEP013B3 publishes three additional closed Browser Tool schemas", async () => {
  const f = await fixture();
  try {
    assert.deepEqual(f.tools.definitions().map((tool) => tool.name), [
      "browser.click", "browser.close", "browser.download", "browser.evidence", "browser.fill",
      "browser.list", "browser.navigate", "browser.open", "browser.press", "browser.screenshot",
      "browser.select", "browser.snapshot", "browser.status", "browser.type", "browser.wait",
    ]);
    for (const tool of f.tools.definitions()) assert.equal(tool.inputSchema.additionalProperties, false);
  } finally { await f.runtime.close(); await rm(f.root, { recursive: true, force: true }); }
});

test("browser.screenshot and browser.download create bounded workspace Artifacts without caller paths", async () => {
  const f = await fixture();
  try {
    const opened = await f.tools.execute("browser.open", { url: "https://example.com" }, context);
    const { sessionId, pageId } = opened.output;
    const snapshot = await f.tools.execute("browser.snapshot", { sessionId, pageId }, context);
    const screenshot = await f.tools.execute("browser.screenshot", { sessionId, pageId, format: "png" }, context);
    assert.equal(screenshot.isError, false);
    assert.deepEqual(screenshot.output.artifact, {
      artifactId: "artifact-1", kind: "BROWSER_SCREENSHOT", fileName: "screenshot.png",
      mediaType: "image/png", sizeBytes: 4, sha256: "0f4636c78f65d3639ece5a064b5ae753e3408614a14fb18ab4d7540d2c248543",
    });
    assert.equal((await stat(join(f.root, "artifact-1", "screenshot.png"))).size, 4);

    const download = await f.tools.execute("browser.download", { sessionId, pageId, ref: snapshot.output.elements[0].ref }, context);
    assert.equal(download.isError, false);
    assert.equal(download.output.artifact.kind, "BROWSER_DOWNLOAD");
    assert.equal(download.output.artifact.fileName, "download-source.json");
    assert.equal(await readFile(join(f.root, "artifact-2", "download-source.json"), "utf8"), "bounded-download");
    assert.deepEqual(f.metadata.map((item) => item.kind), ["BROWSER_SCREENSHOT", "BROWSER_DOWNLOAD"]);
  } finally { await f.runtime.close(); await rm(f.root, { recursive: true, force: true }); }
});

test("browser.download rejects stale refs with a recovery snapshot and never auto-replays", async () => {
  const f = await fixture();
  try {
    const opened = await f.tools.execute("browser.open", { url: "https://example.com" }, context);
    const snapshot = await f.tools.execute("browser.snapshot", { sessionId: opened.output.sessionId, pageId: opened.output.pageId }, context);
    await f.tools.execute("browser.navigate", { sessionId: opened.output.sessionId, pageId: opened.output.pageId, url: "https://example.com/next" }, context);
    const result = await f.tools.execute("browser.download", {
      sessionId: opened.output.sessionId, pageId: opened.output.pageId, ref: snapshot.output.elements[0].ref,
    }, context);
    assert.equal(result.isError, true);
    assert.equal(result.output.error.code, "BROWSER_STALE_REF");
    assert.equal(result.output.error.recoverySnapshot.documentGeneration, 3);
    assert.equal(f.driver.process.context.page.downloadCalls, 0);
  } finally { await f.runtime.close(); await rm(f.root, { recursive: true, force: true }); }
});

test("browser.evidence is cursor-based and bounded", async () => {
  const f = await fixture();
  try {
    const opened = await f.tools.execute("browser.open", {}, context);
    const first = await f.tools.execute("browser.evidence", { sessionId: opened.output.sessionId, pageId: opened.output.pageId, limit: 2 }, context);
    assert.equal(first.isError, false);
    assert.equal(first.output.nextSequence, 2);
    assert.equal(first.output.truncated, true);
    assert.deepEqual(first.output.events.map((event) => event.kind), ["console", "page_error"]);
    const second = await f.tools.execute("browser.evidence", { sessionId: opened.output.sessionId, pageId: opened.output.pageId, afterSequence: 2, limit: 2 }, context);
    assert.equal(second.output.nextSequence, 3);
    assert.equal(second.output.truncated, false);
    assert.deepEqual(second.output.events.map((event) => event.kind), ["network"]);
  } finally { await f.runtime.close(); await rm(f.root, { recursive: true, force: true }); }
});

test("browser output limits fail before Artifact metadata is committed", async () => {
  const f = await fixture({ outputLimits: { maxScreenshotBytes: 3, maxDownloadBytes: 4, maxEvidenceEvents: 2 } });
  try {
    const opened = await f.tools.execute("browser.open", { url: "https://example.com" }, context);
    const snapshot = await f.tools.execute("browser.snapshot", { sessionId: opened.output.sessionId, pageId: opened.output.pageId }, context);
    const screenshot = await f.tools.execute("browser.screenshot", { sessionId: opened.output.sessionId, pageId: opened.output.pageId }, context);
    assert.equal(screenshot.output.error.code, "BROWSER_OUTPUT_TOO_LARGE");
    const download = await f.tools.execute("browser.download", { sessionId: opened.output.sessionId, pageId: opened.output.pageId, ref: snapshot.output.elements[0].ref }, context);
    assert.equal(download.output.error.code, "BROWSER_OUTPUT_TOO_LARGE");
    assert.equal(f.metadata.length, 0);
  } finally { await f.runtime.close(); await rm(f.root, { recursive: true, force: true }); }
});
