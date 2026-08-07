import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import { readHostMetadata, startLocalHost } from "../../services/agent-host/dist/index.js";
import { LocalProtocolClient } from "../../apps/agent-web/dist/index.js";

async function fixture(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "openrill-step004-"));
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
  const host = await startLocalHost({ profile: "protocol", port: 0, env, protocolHandshakeTimeoutMs: 150, ...options });
  await host.ready;
  const metadata = await readHostMetadata(host.paths);
  if (!metadata) throw new Error("missing host metadata");
  return { root, host, metadata, url: `ws://127.0.0.1:${host.port}/protocol`, cleanup: async () => { await host.close(); await rm(root, { recursive: true, force: true }); } };
}

function collector(socket) {
  const frames = [];
  const waiters = [];
  socket.addEventListener("message", (event) => {
    const frame = JSON.parse(String(event.data));
    const index = waiters.findIndex((waiter) => waiter.predicate(frame));
    if (index >= 0) { const [waiter] = waiters.splice(index, 1); clearTimeout(waiter.timer); waiter.resolve(frame); }
    else frames.push(frame);
  });
  return (predicate = () => true, timeoutMs = 1500) => {
    const index = frames.findIndex(predicate);
    if (index >= 0) return Promise.resolve(frames.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for frame")), timeoutMs);
      waiters.push({ predicate, resolve, reject, timer });
    });
  };
}

async function openSocket(url, token, overrides = {}) {
  const socket = new WebSocket(url, "openrill.local.v1");
  const next = collector(socket);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.send(JSON.stringify({
    type: "open", minProtocol: 1, maxProtocol: 1,
    client: { id: "unit", version: "1", platform: process.platform, kind: "test" },
    credential: { kind: "profile-token", token }, ...overrides,
  }));
  return { socket, next };
}

async function rawUpgrade(port, extraHeaders = []) {
  const socket = net.connect(port, "127.0.0.1");
  let output = "";
  socket.setEncoding("utf8"); socket.on("data", (chunk) => { output += chunk; });
  await new Promise((resolve, reject) => { socket.once("connect", resolve); socket.once("error", reject); });
  socket.write([
    "GET /protocol HTTP/1.1", `Host: 127.0.0.1:${port}`, "Upgrade: websocket", "Connection: Upgrade",
    "Sec-WebSocket-Version: 13", "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==", "Sec-WebSocket-Protocol: openrill.local.v1",
    ...extraHeaders, "", "",
  ].join("\r\n"));
  await new Promise((resolve) => { socket.once("close", resolve); setTimeout(() => { socket.destroy(); resolve(); }, 500); });
  return output;
}

test("authenticated WebSocket negotiates protocol and correlates host and diagnostics calls", async () => {
  const f = await fixture();
  try {
    const { socket, next } = await openSocket(f.url, f.metadata.protocolToken);
    const accepted = await next((frame) => frame.type === "accepted");
    assert.equal(accepted.protocol, 1);
    assert.equal(accepted.snapshot.host.state, "READY");
    const operationNames = accepted.capabilities.operations.map((item) => item.name);
    const retainedOperations = ["approval.cancel", "approval.get", "approval.list", "approval.resolve", "artifact.get", "artifact.list", "automation.create", "automation.get", "automation.history", "automation.list", "automation.run_now", "automation.update", "connector.account.list", "connector.deadLetter.list", "connector.delivery.list", "connector.doctor", "connector.ingress.list", "connector.status", "conversation.cancel", "conversation.create", "conversation.execute", "conversation.get", "conversation.list", "conversation.send", "delegation.cancel", "delegation.get", "delegation.list", "diagnostics.ping", "extension.disable", "extension.enable", "extension.get", "extension.list", "goalExecution.adoptPlanRevision", "goalExecution.cancel", "goalExecution.get", "goalExecution.resolveBlocker", "goalExecution.resume", "goalExecution.retry", "goalExecution.revisePlan", "goalExecution.start", "host.status", "task.audit", "task.cancel", "task.get", "task.list", "task.reconcile", "task.retention.preview", "taskFlow.audit", "taskFlow.cancel", "taskFlow.create", "taskFlow.fail", "taskFlow.finish", "taskFlow.get", "taskFlow.list", "taskFlow.reconcile", "taskFlow.resume", "taskFlow.retention.preview", "taskFlow.run", "taskFlow.wait", "ui.snapshot", "workspace.list"];
    assert.equal(new Set(operationNames).size, operationNames.length);
    for (const operation of retainedOperations) assert.ok(operationNames.includes(operation), `retained operation missing: ${operation}`);
    socket.send(JSON.stringify({ type: "call", callId: "c1", idempotencyKey: "k1", operation: "diagnostics.ping", input: { echo: "hello" } }));
    const result = await next((frame) => frame.type === "result" && frame.callId === "c1");
    assert.equal(result.ok, true); assert.deepEqual(result.output, { echo: "hello" });
    socket.close();
  } finally { await f.cleanup(); }
});

test("bad token and non-overlapping protocol are handshake rejections rather than operation results", async () => {
  const f = await fixture();
  try {
    const bad = await openSocket(f.url, f.metadata.controlToken);
    assert.equal((await bad.next((frame) => frame.type === "rejected")).code, "AUTH_FAILED");
    const mismatch = await openSocket(f.url, f.metadata.protocolToken, { minProtocol: 2, maxProtocol: 2 });
    assert.equal((await mismatch.next((frame) => frame.type === "rejected")).code, "PROTOCOL_MISMATCH");
  } finally { await f.cleanup(); }
});

test("first frame, pre-auth byte budget, and one-handshake rule fail closed", async () => {
  const f = await fixture({ protocolHandshakeTimeoutMs: 500 });
  try {
    const socket = new WebSocket(f.url, "openrill.local.v1"); const next = collector(socket);
    await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
    socket.send(JSON.stringify({ type: "call", callId: "early", idempotencyKey: "early", operation: "host.status", input: {} }));
    assert.equal((await next((frame) => frame.type === "rejected")).code, "INVALID_HANDSHAKE");

    const large = new WebSocket(f.url, "openrill.local.v1"); const largeNext = collector(large);
    await new Promise((resolve) => large.addEventListener("open", resolve, { once: true }));
    large.send(JSON.stringify({ type: "open", minProtocol: 1, maxProtocol: 1, client: { id: "x".repeat(17000), version: "1", platform: "node", kind: "test" }, credential: { kind: "profile-token", token: f.metadata.protocolToken } }));
    assert.equal((await largeNext((frame) => frame.type === "rejected")).code, "INVALID_HANDSHAKE");

    const opened = await openSocket(f.url, f.metadata.protocolToken); await opened.next((frame) => frame.type === "accepted");
    opened.socket.send(JSON.stringify({ type: "open", minProtocol: 1, maxProtocol: 1, client: { id: "again", version: "1", platform: "node", kind: "test" }, credential: { kind: "profile-token", token: f.metadata.protocolToken } }));
    const invalid = await opened.next((frame) => frame.type === "result");
    assert.equal(invalid.error.code, "INVALID_FRAME");
  } finally { await f.cleanup(); }
});


test("silent pre-auth connection is closed by the handshake timeout", async () => {
  const f = await fixture({ protocolHandshakeTimeoutMs: 80 });
  try {
    const socket = new WebSocket(f.url, "openrill.local.v1");
    await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
    const closed = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("handshake timeout did not close connection")), 1000);
      socket.addEventListener("close", (event) => { clearTimeout(timer); resolve(event); }, { once: true });
    });
    assert.equal(closed.code, 1008);
  } finally { await f.cleanup(); }
});

test("unknown operations, closed input schemas, and idempotency conflicts return stable result errors", async () => {
  const f = await fixture();
  try {
    const { socket, next } = await openSocket(f.url, f.metadata.protocolToken); await next((frame) => frame.type === "accepted");
    socket.send(JSON.stringify({ type: "call", callId: "u1", idempotencyKey: "u1", operation: "missing", input: {} }));
    assert.equal((await next((frame) => frame.callId === "u1")).error.code, "OPERATION_NOT_FOUND");
    socket.send(JSON.stringify({ type: "call", callId: "i1", idempotencyKey: "i1", operation: "host.status", input: { extra: true } }));
    assert.equal((await next((frame) => frame.callId === "i1")).error.code, "INVALID_INPUT");
    socket.send(JSON.stringify({ type: "call", callId: "r1", idempotencyKey: "same", operation: "diagnostics.ping", input: { echo: "one" } }));
    assert.equal((await next((frame) => frame.callId === "r1")).ok, true);
    socket.send(JSON.stringify({ type: "call", callId: "r2", idempotencyKey: "same", operation: "diagnostics.ping", input: { echo: "one" } }));
    assert.equal((await next((frame) => frame.callId === "r2")).replayed, true);
    socket.send(JSON.stringify({ type: "call", callId: "r3", idempotencyKey: "same", operation: "diagnostics.ping", input: { echo: "two" } }));
    assert.equal((await next((frame) => frame.callId === "r3")).error.code, "IDEMPOTENCY_CONFLICT");
  } finally { await f.cleanup(); }
});

test("notice sequence replays within the retained window and requires resync outside it", async () => {
  const f = await fixture({ protocolNoticeWindowSize: 2 });
  try {
    const first = await openSocket(f.url, f.metadata.protocolToken, { cursor: 0 });
    const accepted = await first.next((frame) => frame.type === "accepted");
    assert.equal(accepted.resyncRequired, false);
    const lifecycle = [await first.next((frame) => frame.type === "notice"), await first.next((frame) => frame.type === "notice")];
    assert.deepEqual(lifecycle.map((item) => item.sequence), [1, 2]);
    f.host.publishNotice("host.lifecycle", { state: "CUSTOM" });
    assert.equal((await first.next((frame) => frame.type === "notice")).sequence, 3);
    first.socket.close();
    f.host.publishNotice("host.lifecycle", { state: "FOUR" });
    f.host.publishNotice("host.lifecycle", { state: "FIVE" });
    const stale = await openSocket(f.url, f.metadata.protocolToken, { cursor: 1 });
    assert.equal((await stale.next((frame) => frame.type === "accepted")).resyncRequired, true);
    stale.socket.close();
  } finally { await f.cleanup(); }
});

test("upgrade denies foreign Origin and untrusted proxy headers before WebSocket authentication", async () => {
  const f = await fixture();
  try {
    assert.match(await rawUpgrade(f.host.port, ["Origin: http://evil.example"]), /^HTTP\/1\.1 403/);
    assert.match(await rawUpgrade(f.host.port, ["X-Forwarded-For: 127.0.0.1"]), /^HTTP\/1\.1 403/);
  } finally { await f.cleanup(); }
});

test("framework-neutral browser client uses only the local protocol boundary", async () => {
  const f = await fixture();
  try {
    const client = new LocalProtocolClient({ url: f.url, token: f.metadata.protocolToken, clientId: "web-test", clientVersion: "1", platform: "test", createCallId: () => "web-call" });
    const accepted = await client.connect();
    assert.equal(accepted.server.product, "OpenRill");
    assert.deepEqual(await client.call("diagnostics.ping", { echo: "web" }, "web-key"), { echo: "web" });
    client.close();
  } finally { await f.cleanup(); }
});
