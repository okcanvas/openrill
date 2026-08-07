import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const browserSourceUrl = new URL("../../apps/agent-web/src/browser-app.ts", import.meta.url);
const browserBuildUrl = new URL("../../apps/agent-web/dist/browser-app.js", import.meta.url);
const liveUrl = new URL("../../scripts/run-step012d-live.mjs", import.meta.url);
const cssUrl = new URL("../../apps/agent-web/public/assets/app.css", import.meta.url);
const evidenceUrl = new URL("../../scripts/browser-page-evidence.mjs", import.meta.url);
const step011LiveUrl = new URL("../../scripts/run-step011-live.mjs", import.meta.url);
async function source(url) { return await readFile(url, "utf8"); }

function flatten(node, output = []) {
  if (node === null || node === undefined || typeof node !== "object") return output;
  output.push(node);
  const children = Array.isArray(node.children) ? node.children : [node.children];
  for (const child of children) {
    if (Array.isArray(child)) for (const entry of child) flatten(entry, output);
    else flatten(child, output);
  }
  return output;
}

test("Automation Control UI owns route, CRUD/run actions, history, and explicit domain notice refresh", async () => {
  const browser = await source(browserSourceUrl);
  assert.match(browser, /const ROUTES = \[[^\]]*"conversations"[^\]]*"automations"/);
  for (const operation of ["automation.create", "automation.list", "automation.get", "automation.update", "automation.run_now", "automation.history"]) {
    assert.match(browser, new RegExp(operation.replace(".", "\\.")));
  }
  assert.match(browser, /notice\.topic === "automation\.job\.updated"/);
  assert.match(browser, /notice\.topic === "automation\.run\.updated"/);
  assert.match(browser, /await loadAutomations\(\)/);
  assert.match(browser, /await loadAutomationHistory\(\)/);
  for (const testId of ["automation-new", "automation-save", "automation-toggle", "automation-run-now", "automation-replay-run", "automation-history"]) {
    assert.match(browser, new RegExp(`data-testid": "${testId}`));
  }
});

test("durable manual replay is not masked by the Local Protocol idempotency cache", async () => {
  const browser = await source(browserSourceUrl);
  assert.match(browser, /const requestKey = replay && lastManualRequestKey\.value/);
  assert.match(browser, /automation\.run_now", \{ jobId: job\.jobId, requestKey \}\)/);
  assert.doesNotMatch(browser, /automation\.run_now", \{ jobId: job\.jobId, requestKey \}, requestKey\)/);
});

test("unrelated Automation edits preserve an unchanged interval anchor", async () => {
  const browser = await source(browserSourceUrl);
  assert.match(browser, /currentSchedule\?\.kind === "interval" && currentSchedule\.everyMs === intervalEveryMs/);
  assert.match(browser, /\? currentSchedule\.anchorMs\s*:\s*Date\.now\(\)/);
  assert.doesNotMatch(browser, /everyMs: intervalEveryMs, anchorMs: Date\.now\(\)/);
});

test("runtime-only render tree exposes the Automation page and mobile-safe layout", async () => {
  const originals = { window: globalThis.window, location: globalThis.location, localStorage: globalThis.localStorage };
  let root;
  const vue = {
    version: "3.5.40",
    createApp(component) { return { mount() { root = component.setup()(); } }; },
    ref(value) { return { value }; },
    shallowRef(value) { return { value }; },
    reactive(value) { return value; },
    computed(getter) { return { get value() { return getter(); } }; },
    onMounted() {},
    onBeforeUnmount() {},
    h(type, props = null, children = undefined) { return { type, props, children }; },
  };
  const storage = new Map();
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: { Vue: vue } });
  Object.defineProperty(globalThis, "location", { configurable: true, writable: true, value: { hash: "#/automations", protocol: "http:", host: "127.0.0.1" } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: { getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, String(value)); } } });
  try {
    await import(`${browserBuildUrl.href}?step012d=${Date.now()}`);
    const nodes = flatten(root);
    assert.equal(nodes.some((node) => node.props?.["data-testid"] === "nav-automations"), true);
    assert.equal(nodes.some((node) => node.props?.["data-testid"] === "automation-new"), true);
    assert.equal(nodes.some((node) => node.props?.["data-testid"] === "automation-save"), true);
    const css = await source(cssUrl);
    assert.match(css, /\.automation-layout/);
    assert.match(css, /@media \(max-width: 900px\)/);
    assert.match(css, /@media \(max-width: 620px\)/);
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key];
      else Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
  }
});

test("actual Chromium fixture proves durable replay, notice refresh, ledger linkage, and secret boundary", async () => {
  const live = await source(liveUrl);
  assert.match(live, /automation:\\n  enabled: true/);
  assert.match(live, /automation-action-state.*RUN_REPLAYED/);
  assert.match(live, /Automation history refreshed by domain notice/);
  assert.match(live, /runs\.length !== 1/);
  assert.match(live, /providerRequests !== 1/);
  assert.match(live, /job\.revision !== 4/);
  assert.match(live, /dbBytes\.includes\(Buffer\.from\(apiSecret\)\)/);
  assert.match(live, /waitForAutomationUiReady/);
  assert.match(live, /startup-phase.*READY/);
  assert.match(live, /OPENRILL_STEP012D_STARTUP_EVIDENCE_BEGIN/);
  assert.match(live, /OPENRILL_STEP012D_LIVE_PASS/);
});

test("actual browser fixtures await Host READY and preserve phased startup evidence", async () => {
  const browser = await source(browserSourceUrl);
  const live = await source(liveUrl);
  const step011Live = await source(step011LiveUrl);
  const evidence = await source(evidenceUrl);
  assert.match(browser, /startupPhase = ref\("BOOTSTRAPPING"\)/);
  for (const phase of ["FETCH_BOOTSTRAP", "CONNECT_PROTOCOL", "LOAD_AUTOMATIONS", "LOAD_HOST_STATUS", "READY", "FAILED"]) {
    assert.match(browser, new RegExp(`startupPhase\\.value = \"${phase}\"`));
  }
  assert.match(browser, /data-testid": "startup-phase"/);
  assert.match(evidence, /startupPhase: document\.querySelector/);
  assert.match(live, /waitForReadyHostMetadata/);
  assert.match(step011Live, /waitForReadyHostMetadata/);
  assert.doesNotMatch(live, /return \{ child, metadata: JSON\.parse\(await readFile/);
});
