import test from "node:test";
import assert from "node:assert/strict";
import {
  attachBrowserPageEvidence,
  createBrowserPageEvidence,
  enableBrowserPageEvidence,
  formatBrowserPageEvidence,
  readBrowserPageState,
  waitForBrowserCondition,
} from "../../scripts/browser-page-evidence.mjs";

class FakeCdp {
  constructor(responses = []) { this.listeners = new Map(); this.calls = []; this.responses = [...responses]; }
  on(method, listener) { this.listeners.set(method, listener); }
  emit(method, params) { this.listeners.get(method)?.(params); }
  async call(method, params = {}) {
    this.calls.push({ method, params });
    if (this.responses.length) {
      const next = this.responses.shift();
      if (next instanceof Error) throw next;
      return next;
    }
    return {};
  }
}

test("browser evidence captures runtime, log, network, and HTTP failures", () => {
  const cdp = new FakeCdp();
  const state = attachBrowserPageEvidence(cdp, createBrowserPageEvidence());
  cdp.emit("Runtime.exceptionThrown", { exceptionDetails: { text: "boom", url: "http://127.0.0.1/app.js", lineNumber: 7, columnNumber: 4 } });
  cdp.emit("Runtime.consoleAPICalled", { type: "error", args: [{ value: "console boom" }] });
  cdp.emit("Log.entryAdded", { entry: { level: "warning", text: "CSP warning", url: "http://127.0.0.1/" } });
  cdp.emit("Network.loadingFailed", { requestId: "r1", errorText: "net::ERR_FAILED", blockedReason: "csp" });
  cdp.emit("Network.responseReceived", { response: { status: 404, statusText: "Not Found", url: "http://127.0.0.1/missing.js", mimeType: "text/plain" } });
  assert.deepEqual(state.entries.map((item) => item.kind), ["runtime.exception", "console.error", "log.warning", "network.failed", "network.http"]);
});

test("browser evidence remains bounded", () => {
  const cdp = new FakeCdp();
  const state = attachBrowserPageEvidence(cdp, createBrowserPageEvidence());
  for (let index = 0; index < 80; index += 1) cdp.emit("Log.entryAdded", { entry: { level: "error", text: `error-${index}` } });
  assert.equal(state.entries.length, 64);
  assert.equal(state.entries[0].text, "error-16");
});

test("browser evidence domains are enabled before navigation", async () => {
  const cdp = new FakeCdp();
  await enableBrowserPageEvidence(cdp);
  assert.deepEqual(cdp.calls.map((item) => item.method).sort(), ["Log.enable", "Network.enable", "Page.enable", "Runtime.enable"]);
});

test("browser page state is returned from Runtime.evaluate", async () => {
  const expected = { url: "http://127.0.0.1/", connection: "FAILED", alert: "bootstrap failed" };
  const cdp = new FakeCdp([{ result: { value: expected } }]);
  assert.deepEqual(await readBrowserPageState(cdp), expected);
});

test("browser evidence format preserves stable boundaries and state", () => {
  const detail = formatBrowserPageEvidence("Vue UI connected", { entries: [{ kind: "network.failed", errorText: "blocked" }] }, { connection: "FAILED" }, false);
  assert.match(detail, /OPENRILL_BROWSER_EVIDENCE_BEGIN/);
  assert.match(detail, /OPENRILL_BROWSER_EVIDENCE_END/);
  assert.match(detail, /Vue UI connected/);
  assert.match(detail, /network\.failed/);
  assert.match(detail, /FAILED/);
});

test("wait timeout includes the first-page diagnostic block instead of last=false only", async () => {
  const cdp = new FakeCdp([
    { result: { value: false } },
    { result: { value: { url: "http://127.0.0.1/", readyState: "complete", connection: "FAILED", alert: "local protocol connection failed" } } },
  ]);
  const evidence = { entries: [{ kind: "runtime.exception", text: "module boot failed" }] };
  await assert.rejects(
    waitForBrowserCondition(cdp, "false", "Vue UI connected", { timeoutMs: 1, evidence }),
    (error) => {
      assert.match(error.message, /OPENRILL_BROWSER_EVIDENCE_BEGIN/);
      assert.match(error.message, /local protocol connection failed/);
      assert.match(error.message, /module boot failed/);
      return true;
    },
  );
});
