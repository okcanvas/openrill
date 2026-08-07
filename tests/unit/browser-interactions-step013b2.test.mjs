import assert from "node:assert/strict";
import test from "node:test";
import { BrowserRuntime, BrowserRuntimeError, registerBrowserTools } from "../../packages/browser-runtime/dist/index.js";
import { ToolRegistry, ToolRuntimeError } from "../../packages/tool-runtime/dist/index.js";

const toolContext = (runId = "run-1", attemptId = "attempt-1") => ({
  runId,
  attemptId,
  workspaceId: "workspace",
  conversationId: "conversation",
  toolCallId: "tool-call",
});

class ActionPage {
  constructor(id) { this.id = id; }
  url = "https://example.com/form";
  documentGeneration = 1;
  actions = [];
  closed = 0;
  popupListeners = new Set();
  downloadListeners = new Set();
  navigationListeners = new Set();
  nextDialog = null;
  navigateOnAction = false;
  async navigate(url) {
    this.url = url;
    this.documentGeneration += 1;
    for (const listener of this.navigationListeners) listener({ url, documentGeneration: this.documentGeneration });
    return { url };
  }
  currentUrl() { return this.url; }
  async title() { return `Document ${this.documentGeneration}`; }
  async snapshot() {
    return {
      documentGeneration: this.documentGeneration,
      url: this.url,
      title: `Document ${this.documentGeneration}`,
      text: `Fixture document ${this.documentGeneration}`,
      elements: [
        { elementId: `aria:button-${this.documentGeneration}`, role: "button", name: "Continue", interactive: true },
        { elementId: `aria:input-${this.documentGeneration}`, role: "textbox", name: "Name", interactive: true },
        { elementId: `aria:select-${this.documentGeneration}`, role: "combobox", name: "Choice", interactive: true },
      ],
      truncated: false,
    };
  }
  async act(action) {
    this.actions.push(action);
    if (this.nextDialog) {
      const dialog = this.nextDialog;
      this.nextDialog = null;
      return { documentGeneration: this.documentGeneration, url: this.url, navigated: false, dialog };
    }
    if (this.navigateOnAction) {
      this.navigateOnAction = false;
      this.url = "https://example.com/after";
      this.documentGeneration += 1;
      for (const listener of this.navigationListeners) listener({ url: this.url, documentGeneration: this.documentGeneration });
      return { documentGeneration: this.documentGeneration, url: this.url, navigated: true };
    }
    return { documentGeneration: this.documentGeneration, url: this.url, navigated: false };
  }
  async close() { this.closed += 1; }
  onPopup(listener) { this.popupListeners.add(listener); return () => this.popupListeners.delete(listener); }
  onDownload(listener) { this.downloadListeners.add(listener); return () => this.downloadListeners.delete(listener); }
  onMainFrameNavigated(listener) { this.navigationListeners.add(listener); return () => this.navigationListeners.delete(listener); }
}

class ActionContext {
  constructor(driver, options) { this.id = `context-${++driver.contexts}`; this.driver = driver; this.options = options; }
  async newPage() {
    const page = new ActionPage(`page-${++this.driver.pages}`);
    this.driver.page = page;
    return page;
  }
  async close() {}
}

class ActionProcess {
  constructor(driver) { this.id = "process"; this.driver = driver; }
  async createContext(options) {
    this.driver.contextOptions = options;
    return new ActionContext(this.driver, options);
  }
  async close() {}
  onDisconnected() { return () => {}; }
}

class ActionDriver {
  contexts = 0;
  pages = 0;
  page = null;
  contextOptions = null;
  async launch() { return new ActionProcess(this); }
  async dispose() {}
}

function runtimeAndTools() {
  const driver = new ActionDriver();
  let id = 0;
  const runtime = new BrowserRuntime({
    driver,
    headless: true,
    limits: {
      maxSessions: 2,
      maxPagesPerSession: 2,
      launchTimeoutMs: 2_000,
      actionTimeoutMs: 2_000,
      idleTimeoutMs: 60_000,
      sweepIntervalMs: 60_000,
    },
    policy: {
      navigation: { allowPrivateNetwork: false, allowedHostnames: [] },
      popup: "DENY",
      download: "DENY",
      persistentStorage: "DENY",
      dialog: "BLOCK_AND_DISMISS",
    },
    createId: () => `runtime-${++id}`,
    lookup: async (hostname) => hostname === "private.example"
      ? [{ address: "127.0.0.1", family: 4 }]
      : [{ address: "93.184.216.34", family: 4 }],
  });
  const tools = new ToolRegistry();
  registerBrowserTools(tools, runtime);
  return { driver, runtime, tools };
}

async function openAndSnapshot(tools, context = toolContext()) {
  const opened = await tools.execute("browser.open", {}, context);
  assert.equal(opened.isError, false);
  const snapshot = await tools.execute("browser.snapshot", { sessionId: opened.output.sessionId, pageId: opened.output.pageId }, context);
  assert.equal(snapshot.isError, false);
  return { opened: opened.output, snapshot: snapshot.output };
}

test("STEP013B2 publishes six interaction tools as closed schemas", async () => {
  const { runtime, tools } = runtimeAndTools();
  try {
    const retained = new Set([
      "browser.click", "browser.close", "browser.fill", "browser.list", "browser.navigate", "browser.open",
      "browser.press", "browser.select", "browser.snapshot", "browser.status", "browser.type", "browser.wait",
    ]);
    assert.deepEqual(tools.definitions().map((definition) => definition.name).filter((name) => retained.has(name)), [
      "browser.click",
      "browser.close",
      "browser.fill",
      "browser.list",
      "browser.navigate",
      "browser.open",
      "browser.press",
      "browser.select",
      "browser.snapshot",
      "browser.status",
      "browser.type",
      "browser.wait",
    ]);
    for (const definition of tools.definitions()) {
      assert.equal(definition.inputSchema.type, "object");
      assert.equal(definition.inputSchema.additionalProperties, false);
    }
    await assert.rejects(
      () => tools.execute("browser.wait", { sessionId: "s", pageId: "p", timeMs: 1, url: "https://example.com" }, toolContext()),
      (error) => error instanceof ToolRuntimeError && error.code === "TOOL_INPUT_INVALID",
    );
  } finally {
    await runtime.close();
  }
});

test("interaction tools resolve public refs to adapter-owned identities", async () => {
  const { driver, runtime, tools } = runtimeAndTools();
  try {
    const { opened, snapshot } = await openAndSnapshot(tools);
    const button = snapshot.elements.find((element) => element.role === "button");
    const input = snapshot.elements.find((element) => element.role === "textbox");
    const select = snapshot.elements.find((element) => element.role === "combobox");
    assert.ok(button && input && select);

    const calls = [
      ["browser.click", { sessionId: opened.sessionId, pageId: opened.pageId, ref: button.ref }],
      ["browser.type", { sessionId: opened.sessionId, pageId: opened.pageId, ref: input.ref, text: "Kim", submit: true }],
      ["browser.press", { sessionId: opened.sessionId, pageId: opened.pageId, key: "Escape" }],
      ["browser.select", { sessionId: opened.sessionId, pageId: opened.pageId, ref: select.ref, values: ["a", "b"] }],
      ["browser.fill", { sessionId: opened.sessionId, pageId: opened.pageId, ref: input.ref, value: "Wonsig" }],
      ["browser.wait", { sessionId: opened.sessionId, pageId: opened.pageId, ref: input.ref }],
      ["browser.wait", { sessionId: opened.sessionId, pageId: opened.pageId, timeMs: 0 }],
      ["browser.wait", { sessionId: opened.sessionId, pageId: opened.pageId, url: "https://example.com/form" }],
    ];
    for (const [name, inputValue] of calls) {
      const result = await tools.execute(name, inputValue, toolContext());
      assert.equal(result.isError, false, `${name}: ${JSON.stringify(result.output)}`);
      assert.equal(result.output.navigated, false);
    }
    assert.deepEqual(driver.page.actions, [
      { kind: "click", elementId: "aria:button-1" },
      { kind: "type", elementId: "aria:input-1", text: "Kim", submit: true },
      { kind: "press", key: "Escape" },
      { kind: "select", elementId: "aria:select-1", values: ["a", "b"] },
      { kind: "fill", elementId: "aria:input-1", value: "Wonsig" },
      { kind: "wait-element", elementId: "aria:input-1" },
      { kind: "wait-time", timeMs: 0 },
      { kind: "wait-url", url: "https://example.com/form" },
    ]);
  } finally {
    await runtime.close();
  }
});

test("action-triggered navigation returns fresh page state and stale ref recovery snapshot", async () => {
  const { driver, runtime, tools } = runtimeAndTools();
  try {
    const { opened, snapshot } = await openAndSnapshot(tools);
    const oldRef = snapshot.elements.find((element) => element.role === "button").ref;
    driver.page.navigateOnAction = true;
    const clicked = await tools.execute("browser.click", { sessionId: opened.sessionId, pageId: opened.pageId, ref: oldRef }, toolContext());
    assert.equal(clicked.isError, false);
    assert.equal(clicked.output.navigated, true);
    assert.equal(clicked.output.url, "https://example.com/after");
    assert.ok(clicked.output.pageState);
    assert.equal(clicked.output.pageState.documentGeneration, 2);
    assert.equal(clicked.output.pageState.elements.some((element) => element.ref === oldRef), false);

    const stale = await tools.execute("browser.click", { sessionId: opened.sessionId, pageId: opened.pageId, ref: oldRef }, toolContext());
    assert.equal(stale.isError, true);
    assert.equal(stale.output.error.code, "BROWSER_STALE_REF");
    assert.equal(stale.output.error.recoverySnapshot.documentGeneration, 2);
    assert.ok(stale.output.error.recoverySnapshot.elements.some((element) => element.role === "button"));
    assert.equal(driver.page.actions.length, 1, "stale refs must never dispatch an adapter action");
  } finally {
    await runtime.close();
  }
});

test("modal dialogs block the action, expose bounded state, and are not treated as success", async () => {
  const { driver, runtime, tools } = runtimeAndTools();
  try {
    const { opened, snapshot } = await openAndSnapshot(tools);
    const button = snapshot.elements.find((element) => element.role === "button");
    driver.page.nextDialog = { id: "d1", type: "confirm", message: "Continue?" };
    const blocked = await tools.execute("browser.click", { sessionId: opened.sessionId, pageId: opened.pageId, ref: button.ref }, toolContext());
    assert.equal(blocked.isError, true);
    assert.equal(blocked.output.error.code, "BROWSER_DIALOG_BLOCKED");
    assert.deepEqual(blocked.output.error.dialog, { id: "d1", type: "confirm", message: "Continue?" });
    assert.equal(runtime.snapshot().events.some((event) => event.kind === "action.dialog_blocked"), true);
  } finally {
    await runtime.close();
  }
});

test("Browser context owns a pre-dispatch top-level navigation policy callback", async () => {
  const { driver, runtime } = runtimeAndTools();
  try {
    await runtime.openSession({ workspaceId: "workspace", conversationId: "conversation", runId: "run", attemptId: "attempt" });
    assert.equal(typeof driver.contextOptions.assertNavigationAllowed, "function");
    await driver.contextOptions.assertNavigationAllowed("https://example.com/safe");
    await assert.rejects(
      () => driver.contextOptions.assertNavigationAllowed("http://private.example/blocked"),
      (error) => error instanceof BrowserRuntimeError && error.code === "BROWSER_NAVIGATION_BLOCKED",
    );
  } finally {
    await runtime.close();
  }
});
