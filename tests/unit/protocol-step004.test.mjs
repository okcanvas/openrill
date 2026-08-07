import test from "node:test";
import assert from "node:assert/strict";
import {
  OPENRILL_PROTOCOL_MAX,
  OPENRILL_PROTOCOL_MIN,
  negotiateProtocol,
  validateCallFrame,
  validateOpenFrame,
} from "../../packages/protocol/dist/index.js";
import { NoticeWindow, evaluateProtocolUpgrade } from "../../services/agent-host/dist/index.js";

test("open handshake schema is closed and protocol overlap selects the highest compatible version", () => {
  const valid = validateOpenFrame({
    type: "open", minProtocol: 1, maxProtocol: 1,
    client: { id: "test", version: "1", platform: "node", kind: "test" },
    credential: { kind: "profile-token", token: "x".repeat(32) }, cursor: 0,
  });
  assert.equal(valid.ok, true);
  assert.equal(negotiateProtocol(1, 2, OPENRILL_PROTOCOL_MIN, OPENRILL_PROTOCOL_MAX), 1);
  assert.equal(negotiateProtocol(2, 3, OPENRILL_PROTOCOL_MIN, OPENRILL_PROTOCOL_MAX), null);
  assert.equal(validateOpenFrame({ ...(valid.ok ? valid.value : {}), extra: true }).ok, false);
});

test("call schema requires correlation and idempotency fields and rejects unknown envelope keys", () => {
  assert.equal(validateCallFrame({ type: "call", callId: "c1", idempotencyKey: "i1", operation: "host.status", input: {} }).ok, true);
  assert.equal(validateCallFrame({ type: "call", callId: "c1", operation: "host.status", input: {} }).ok, false);
  assert.equal(validateCallFrame({ type: "call", callId: "c1", idempotencyKey: "i1", operation: "host.status", input: {}, extra: 1 }).ok, false);
});

test("notice window provides monotonic sequence, bounded replay, and explicit resync", () => {
  let now = 1000;
  const window = new NoticeWindow(2, () => now++);
  assert.equal(window.publish("one", {}).sequence, 1);
  assert.equal(window.publish("two", {}).sequence, 2);
  assert.deepEqual(window.replayAfter(0).notices.map((item) => item.sequence), [1, 2]);
  window.publish("three", {});
  assert.deepEqual(window.replayAfter(1).notices.map((item) => item.sequence), [2, 3]);
  assert.equal(window.replayAfter(0).resyncRequired, true);
  assert.equal(window.replayAfter(99).resyncRequired, true);
});

test("upgrade policy allows only direct loopback local origins and rejects proxy trust escalation", () => {
  const request = (headers = {}, remoteAddress = "127.0.0.1", url = "/protocol") => ({
    url, method: "GET", socket: { remoteAddress }, headers: {
      host: "127.0.0.1:47117", upgrade: "websocket", connection: "Upgrade", "sec-websocket-version": "13",
      "sec-websocket-protocol": "openrill.local.v1", ...headers,
    },
  });
  assert.equal(evaluateProtocolUpgrade(request(), 47117).code, "OK");
  assert.equal(evaluateProtocolUpgrade(request({ origin: "http://evil.example" }), 47117).code, "ORIGIN_DENIED");
  assert.equal(evaluateProtocolUpgrade(request({ "x-forwarded-for": "127.0.0.1" }), 47117).code, "PROXY_DENIED");
  assert.equal(evaluateProtocolUpgrade(request({}, "10.0.0.2"), 47117).code, "REMOTE_DENIED");
  assert.equal(evaluateProtocolUpgrade(request({}, "127.0.0.1", "/other"), 47117).code, "PATH_DENIED");
});
