import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  BrowserRuntime,
  BrowserRuntimeError,
  assertBrowserNavigationAllowed,
} from "../../packages/browser-runtime/dist/index.js";
import { validateAndMaterializeConfig } from "../../packages/config/dist/index.js";
import { startLocalHost } from "../../services/agent-host/dist/index.js";

const owner = (runId = "run-1") => ({ workspaceId: "workspace", conversationId: "conversation", runId, attemptId: `${runId}-attempt` });
const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

class FakeDownload {
  cancelled = 0;
  async cancel() { this.cancelled += 1; }
}

class FakePage {
  constructor(id, navigateImpl) { this.id = id; this.navigateImpl = navigateImpl; }
  url = "about:blank";
  closed = 0;
  documentGeneration = 1;
  popupListeners = new Set();
  downloadListeners = new Set();
  navigationListeners = new Set();
  async navigate(url, options) {
    const result = this.navigateImpl ? await this.navigateImpl(url, options) : { url };
    this.url = result.url;
    this.documentGeneration += 1;
    for (const listener of this.navigationListeners) listener({ url: this.url, documentGeneration: this.documentGeneration });
    return result;
  }
  currentUrl() { return this.url; }
  async title() { return `Title ${this.documentGeneration}`; }
  async snapshot() {
    return {
      documentGeneration: this.documentGeneration,
      url: this.url,
      title: `Title ${this.documentGeneration}`,
      text: `Document ${this.documentGeneration}`,
      elements: [{ elementId: `button-${this.documentGeneration}`, role: "button", name: "Continue", interactive: true }],
      truncated: false,
    };
  }
  async close() { this.closed += 1; }
  onPopup(listener) { this.popupListeners.add(listener); return () => this.popupListeners.delete(listener); }
  onDownload(listener) { this.downloadListeners.add(listener); return () => this.downloadListeners.delete(listener); }
  onMainFrameNavigated(listener) { this.navigationListeners.add(listener); return () => this.navigationListeners.delete(listener); }
  emitPopup(page) { for (const listener of this.popupListeners) listener(page); }
  emitDownload(download) { for (const listener of this.downloadListeners) listener(download); }
}

class FakeContext {
  constructor(id, driver) { this.id = id; this.driver = driver; }
  closed = 0;
  pages = [];
  async newPage() {
    const page = new FakePage(`page-handle-${++this.driver.pageSequence}`, this.driver.navigateImpl);
    this.pages.push(page);
    this.driver.pages.push(page);
    return page;
  }
  async close() { this.closed += 1; }
}

class FakeProcess {
  constructor(driver) { this.id = `browser-${driver.launches}`; this.driver = driver; }
  closed = 0;
  disconnectListeners = new Set();
  async createContext(options) {
    this.driver.contextOptions.push(options);
    const context = new FakeContext(`context-${++this.driver.contextSequence}`, this.driver);
    this.driver.contexts.push(context);
    return context;
  }
  async close() { this.closed += 1; }
  onDisconnected(listener) { this.disconnectListeners.add(listener); return () => this.disconnectListeners.delete(listener); }
  disconnect(reason = new Error("crashed")) { for (const listener of [...this.disconnectListeners]) listener(reason); }
}

class FakeDriver {
  launches = 0;
  disposed = 0;
  contextSequence = 0;
  pageSequence = 0;
  contexts = [];
  pages = [];
  contextOptions = [];
  process = null;
  launchBarrier = null;
  navigateImpl = null;
  async launch(options) {
    this.launches += 1;
    this.launchOptions = options;
    if (this.launchBarrier) await this.launchBarrier;
    this.process = new FakeProcess(this);
    return this.process;
  }
  async dispose() { this.disposed += 1; }
}

function createRuntime(driver, overrides = {}) {
  let id = 0;
  return new BrowserRuntime({
    driver,
    headless: true,
    limits: {
      maxSessions: 2,
      maxPagesPerSession: 2,
      launchTimeoutMs: 2_000,
      actionTimeoutMs: 2_000,
      idleTimeoutMs: 1_000,
      sweepIntervalMs: 60_000,
      ...overrides.limits,
    },
    policy: {
      navigation: { allowPrivateNetwork: false, allowedHostnames: ["127.0.0.1"], ...overrides.navigation },
      popup: "DENY",
      download: "DENY",
      persistentStorage: "DENY",
      dialog: "BLOCK_AND_DISMISS",
    },
    createId: () => `id-${++id}`,
    now: overrides.now,
    lookup: overrides.lookup ?? (async () => [{ address: "93.184.216.34", family: 4 }]),
  });
}

async function withServer(handler, work) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", (error) => error ? reject(error) : resolve()));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    await work(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
}

test("browser config is closed, bounded, and disabled by default", () => {
  const defaults = validateAndMaterializeConfig({ version: 1 });
  assert.deepEqual(defaults.browser, {
    enabled: false,
    headless: true,
    launchTimeoutMs: 30_000,
    actionTimeoutMs: 15_000,
    idleTimeoutMs: 300_000,
    sweepIntervalMs: 30_000,
    maxSessions: 4,
    maxPagesPerSession: 8,
    allowPrivateNetwork: false,
    allowedHostnames: [],
  });
  const configured = validateAndMaterializeConfig({
    version: 1,
    browser: { enabled: true, headless: false, maxSessions: 3, allowedHostnames: ["EXAMPLE.COM", "*.corp.example"] },
  });
  assert.equal(configured.browser.enabled, true);
  assert.equal(configured.browser.headless, false);
  assert.deepEqual(configured.browser.allowedHostnames, ["*.corp.example", "example.com"]);
  assert.throws(() => validateAndMaterializeConfig({ version: 1, browser: { maxSessions: 0 } }), /validation failed/);
  assert.throws(() => validateAndMaterializeConfig({ version: 1, browser: { mystery: true } }), /validation failed/);
});

test("navigation policy blocks credentials, unsafe schemes, and private DNS results", async () => {
  const policy = { allowPrivateNetwork: false, allowedHostnames: [] };
  await assert.rejects(() => assertBrowserNavigationAllowed("https://user:secret@example.com", policy), (error) => error instanceof BrowserRuntimeError && error.code === "BROWSER_NAVIGATION_BLOCKED" && !error.message.includes("secret"));
  await assert.rejects(() => assertBrowserNavigationAllowed("file:///etc/passwd", policy), /protocol is not allowed/);
  await assert.rejects(() => assertBrowserNavigationAllowed("http://internal.example", policy, async () => [{ address: "127.0.0.1", family: 4 }]), /resolves to a private address/);
  const allowed = await assertBrowserNavigationAllowed("http://127.0.0.1:8080/path", { allowPrivateNetwork: false, allowedHostnames: ["127.0.0.1"] });
  assert.equal(allowed.hostname, "127.0.0.1");
  assert.equal((await assertBrowserNavigationAllowed("about:blank", policy)).href, "about:blank");
});

test("concurrent sessions share one single-flight browser launch and isolated contexts", async () => {
  const driver = new FakeDriver();
  let release;
  driver.launchBarrier = new Promise((resolve) => { release = resolve; });
  const runtime = createRuntime(driver);
  const first = runtime.openSession(owner("run-a"));
  const second = runtime.openSession(owner("run-b"));
  await nextTurn();
  assert.equal(driver.launches, 1);
  release();
  const sessions = await Promise.all([first, second]);
  assert.equal(sessions.length, 2);
  assert.equal(driver.contexts.length, 2);
  assert.deepEqual(driver.contextOptions.map((item) => [item.acceptDownloads, item.persistentStorage]), [[true, false], [true, false]]);
  await runtime.close();
});


test("launch timeout is bounded even when the injected driver ignores AbortSignal", async () => {
  const driver = new FakeDriver();
  driver.launchBarrier = new Promise(() => {});
  const runtime = createRuntime(driver, { limits: { launchTimeoutMs: 25 } });
  await assert.rejects(() => runtime.openSession(owner()), (error) => error.code === "BROWSER_LAUNCH_TIMEOUT");
  assert.equal(runtime.snapshot().state, "FAILED");
  await runtime.close();
});

test("session and page limits reject before creating extra browser actors", async () => {
  const driver = new FakeDriver();
  const runtime = createRuntime(driver, { limits: { maxSessions: 1, maxPagesPerSession: 1 } });
  const session = await runtime.openSession(owner());
  await assert.rejects(() => runtime.openSession(owner("run-2")), (error) => error.code === "BROWSER_SESSION_LIMIT");
  await runtime.openPage(session.sessionId);
  await assert.rejects(() => runtime.openPage(session.sessionId), (error) => error.code === "BROWSER_PAGE_LIMIT");
  assert.equal(driver.contexts.length, 1);
  assert.equal(driver.pages.length, 1);
  await runtime.close();
});

test("local deterministic navigation validates both requested and final redirect URL", async () => {
  const driver = new FakeDriver();
  driver.navigateImpl = async (url, options) => {
    const response = await fetch(url, { signal: options.signal, redirect: "follow" });
    await response.text();
    return { url: response.url };
  };
  const runtime = createRuntime(driver);
  await withServer((request, response) => {
    if (request.url === "/redirect") { response.writeHead(302, { location: "/ok" }); response.end(); return; }
    response.writeHead(200, { "content-type": "text/plain" }); response.end("ok");
  }, async (base) => {
    const session = await runtime.openSession(owner());
    const page = await runtime.openPage(session.sessionId);
    const navigated = await runtime.navigate(session.sessionId, page.pageId, `${base}/redirect`);
    assert.equal(navigated.url, `${base}/ok`);
    assert.equal(runtime.snapshot().events.at(-1).kind, "navigation.completed");
  });
  await runtime.close();
});

test("unexpected popups are closed and downloads are cancelled", async () => {
  const driver = new FakeDriver();
  const runtime = createRuntime(driver);
  const session = await runtime.openSession(owner());
  await runtime.openPage(session.sessionId);
  const source = driver.pages[0];
  const popup = new FakePage("popup", null);
  const download = new FakeDownload();
  source.emitPopup(popup);
  source.emitDownload(download);
  await nextTurn();
  assert.equal(popup.closed, 1);
  assert.equal(download.cancelled, 1);
  assert.deepEqual(runtime.snapshot().events.slice(-2).map((event) => event.kind), ["page.popup_denied", "page.download_denied"]);
  await runtime.close();
});

test("Run cancellation closes only sessions owned by that Run", async () => {
  const driver = new FakeDriver();
  const runtime = createRuntime(driver);
  const a = await runtime.openSession(owner("run-a"));
  const b = await runtime.openSession(owner("run-b"));
  await runtime.openPage(a.sessionId);
  await runtime.openPage(b.sessionId);
  assert.equal(await runtime.cancelRun("run-a"), 1);
  assert.deepEqual(runtime.snapshot().sessions.map((session) => session.owner.runId), ["run-b"]);
  assert.equal(driver.contexts[0].closed, 1);
  assert.equal(driver.contexts[1].closed, 0);
  await runtime.close();
});

test("idle sweep closes expired sessions without touching active sessions", async () => {
  const driver = new FakeDriver();
  let now = 1_000;
  const runtime = createRuntime(driver, { now: () => now, limits: { idleTimeoutMs: 100 } });
  const expired = await runtime.openSession(owner("expired"));
  now = 1_050;
  const active = await runtime.openSession(owner("active"));
  now = 1_101;
  assert.deepEqual(await runtime.sweepIdle(), [expired.sessionId]);
  assert.deepEqual(runtime.snapshot().sessions.map((session) => session.sessionId), [active.sessionId]);
  await runtime.close();
});

test("browser disconnect invalidates stale sessions and a later session gets a new generation", async () => {
  const driver = new FakeDriver();
  const runtime = createRuntime(driver);
  const staleSession = await runtime.openSession(owner("stale"));
  const stalePage = await runtime.openPage(staleSession.sessionId);
  const firstGeneration = staleSession.generation;
  driver.process.disconnect();
  assert.equal(runtime.snapshot().state, "FAILED");
  await assert.rejects(() => runtime.navigate(staleSession.sessionId, stalePage.pageId, "https://example.com"), (error) => error.code === "BROWSER_STALE_HANDLE");
  const fresh = await runtime.openSession(owner("fresh"));
  assert.ok(fresh.generation > firstGeneration);
  assert.equal(driver.launches, 2);
  await runtime.close();
});

test("close rejects new work synchronously and waits for in-flight navigation", async () => {
  const driver = new FakeDriver();
  let release;
  driver.navigateImpl = async (url) => { await new Promise((resolve) => { release = resolve; }); return { url }; };
  const runtime = createRuntime(driver);
  const session = await runtime.openSession(owner());
  const page = await runtime.openPage(session.sessionId);
  const navigation = runtime.navigate(session.sessionId, page.pageId, "https://example.com");
  await nextTurn();
  const closing = runtime.close();
  assert.equal(runtime.snapshot().state, "CLOSING");
  await assert.rejects(() => runtime.openSession(owner("late")), (error) => error.code === "BROWSER_RUNTIME_CLOSING");
  let closed = false;
  void closing.then(() => { closed = true; });
  await nextTurn();
  assert.equal(closed, false);
  release();
  await navigation;
  await closing;
  assert.equal(runtime.snapshot().state, "CLOSED");
  assert.equal(driver.process.closed, 1);
  assert.equal(driver.disposed, 1);
});

test("Host preflights an invalid configured Chromium executable before profile lock acquisition", async () => {
  const config = validateAndMaterializeConfig({ version: 1, browser: { enabled: true, executablePath: "definitely-missing-openrill-chromium.exe" } });
  await assert.rejects(
    () => startLocalHost({ profile: "step013b1-invalid-browser", port: 0, config }),
    /Browser executable preflight failed before profile lock acquisition/,
  );
});

test("Host owns BrowserRuntime disposal and awaits it before completing shutdown", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step013a-host-"));
  const driver = new FakeDriver();
  let disposeStartedResolve;
  let disposeRelease;
  const disposeStarted = new Promise((resolve) => { disposeStartedResolve = resolve; });
  const disposeBarrier = new Promise((resolve) => { disposeRelease = resolve; });
  driver.dispose = async () => { disposeStartedResolve(); await disposeBarrier; driver.disposed += 1; };
  const config = validateAndMaterializeConfig({ version: 1, browser: { enabled: true } });
  let host;
  try {
    host = await startLocalHost({
      profile: "step013a",
      port: 0,
      config,
      browserDriver: driver,
      env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") },
    });
    await host.ready;
    const closing = host.close();
    await disposeStarted;
    let finished = false;
    void closing.then(() => { finished = true; });
    await nextTurn();
    assert.equal(finished, false);
    disposeRelease();
    await closing;
    assert.equal(driver.disposed, 1);
  } finally {
    await host?.close().catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
});
