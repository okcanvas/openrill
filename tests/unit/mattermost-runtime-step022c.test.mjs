import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { ConnectorAdapterRegistry, ConnectorRuntimeService } from "../../packages/connectors/dist/index.js";
import { MattermostConnectorRuntime } from "../../connectors/mattermost/dist/index.js";

class MockSocket {
  readyState = 0;
  sent = [];
  closes = [];
  #listeners = new Map();
  addEventListener(type, listener) { const list = this.#listeners.get(type) ?? []; list.push(listener); this.#listeners.set(type, list); }
  removeEventListener(type, listener) { this.#listeners.set(type, (this.#listeners.get(type) ?? []).filter((entry) => entry !== listener)); }
  send(data) { this.sent.push(data); }
  close(code = 1000, reason = "closed") { if (this.readyState === 3) return; this.closes.push({ code, reason }); this.readyState = 3; this.emit("close", { code, reason }); }
  emit(type, event = {}) { if (type === "open") this.readyState = 1; for (const listener of [...(this.#listeners.get(type) ?? [])]) listener(event); }
}

async function waitFor(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("condition was not reached before timeout");
}

async function fixture(fetchImpl) {
  const root = await mkdtemp(join(tmpdir(), "openrill-step022c-runtime-"));
  const paths = resolveProfilePaths({ profile: "step022c-runtime", env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  let n = 0;
  const conversations = new ConversationService({ state, workspaceIds: ["alpha"], createId: () => `id-${++n}` });
  const service = new ConnectorRuntimeService({ state, conversations, workspaceIds: ["alpha"], createId: () => `connector-${++n}`, ingressLeaseMs: 100, deliveryLeaseMs: 100 });
  const registry = new ConnectorAdapterRegistry({ service });
  const controller = new AbortController();
  const sockets = [];
  let runtime;
  const port = registry.register("openrill.connector.mattermost", {
    connectorId: "mattermost",
    normalizeIngress(claim, signal) { return runtime.normalizeIngress(claim, signal); },
    deliver(claim, signal) { return runtime.deliver(claim, signal); },
  }, controller.signal);
  runtime = new MattermostConnectorRuntime({
    accountId: "main", workspaceId: "alpha", baseUrl: "http://127.0.0.1:8065", botToken: "private-token",
    requireMention: true, allowPrivateNetwork: true, requestTimeoutMs: 2_000,
    reconnectMinMs: 100, reconnectMaxMs: 1_000, pumpIntervalMs: 50,
  }, {
    port, fetchImpl,
    websocketFactory: () => { const socket = new MockSocket(); sockets.push(socket); setImmediate(() => socket.emit("open", {})); return socket; },
    sleep: async (_milliseconds, signal) => { if (signal.aborted) throw signal.reason; },
  });
  return { root, state, conversations, service, registry, controller, sockets, runtime, port, cleanup: async () => { await runtime.close().catch(() => undefined); controller.abort(); if (state.isOpen()) state.close(); await rm(root, { recursive: true, force: true }); } };
}

function posted(id = "post-1", message = "@openrill hello", rootId = "") {
  return JSON.stringify({ event: "posted", data: { post: JSON.stringify({ id, user_id: "user-1", channel_id: "channel-1", message, root_id: rootId, type: "", create_at: 100 }), channel_type: "O", team_id: "team-1", sender_name: "alice" }, broadcast: { channel_id: "channel-1", user_id: "user-1", team_id: "team-1" } });
}

test("STEP022C Mattermost runtime authenticates WebSocket, persists posted event, and creates one Run", async () => {
  const f = await fixture(async (input) => {
    if (String(input).endsWith("/users/me")) return Response.json({ id: "bot-id", username: "openrill" });
    return Response.json({ id: "reply-1", channel_id: "channel-1" });
  });
  try {
    await f.runtime.start();
    assert.equal(f.runtime.status().state, "CONNECTED");
    assert.deepEqual(JSON.parse(f.sockets[0].sent[0]), { seq: 1, action: "authentication_challenge", data: { token: "private-token" } });
    f.sockets[0].emit("message", { data: posted() });
    await waitFor(() => f.service.listIngress({ connectorId: "mattermost", status: "ADOPTED" }).length === 1);
    assert.equal(f.conversations.list({ workspaceId: "alpha" }).length, 1);
    const context = f.conversations.executionContext(f.service.listIngress({ connectorId: "mattermost", status: "ADOPTED" })[0].runId);
    assert.equal(context.messages[0].content.text, "hello");
    assert.equal(context.run.status, "CREATED");
  } finally { await f.cleanup(); }
});

test("STEP022C reconnect replay of the same Mattermost post does not create duplicate ingress or Run", async () => {
  const f = await fixture(async () => Response.json({ id: "bot-id", username: "openrill" }));
  try {
    await f.runtime.start();
    f.sockets[0].emit("message", { data: posted("post-replay") });
    await waitFor(() => f.service.listIngress({ connectorId: "mattermost" }).length === 1);
    f.sockets[0].close(1006, "network");
    await waitFor(() => f.sockets.length >= 2);
    f.sockets[1].emit("message", { data: posted("post-replay") });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(f.service.listIngress({ connectorId: "mattermost" }).length, 1);
    assert.equal(f.conversations.list({ workspaceId: "alpha" }).length, 1);
    assert.equal(f.runtime.status().state, "CONNECTED");
  } finally { await f.cleanup(); }
});

test("STEP022C runtime drains durable outbound delivery and stores exact Mattermost receipt", async () => {
  const requests = [];
  const f = await fixture(async (input, init) => {
    if (String(input).endsWith("/users/me")) return Response.json({ id: "bot-id", username: "openrill" });
    requests.push(JSON.parse(init.body));
    return Response.json({ id: "mattermost-post-9", channel_id: "channel-1", root_id: "root-1", create_at: 999 });
  });
  try {
    await f.runtime.start();
    const conversation = f.conversations.create({ workspaceId: "alpha" });
    f.port.enqueueDelivery({ accountId: "main", conversationId: conversation.conversationId, targetKey: "channel-1", threadKey: "root-1", payloadVersion: 1, payload: { type: "text", text: "outbound reply" }, idempotencyKey: "outbound-1" });
    await waitFor(() => f.service.listDeliveries({ connectorId: "mattermost", status: "DELIVERED" }).length === 1);
    assert.deepEqual(requests, [{ channel_id: "channel-1", message: "outbound reply", root_id: "root-1" }]);
    const delivery = f.service.listDeliveries({ connectorId: "mattermost" })[0];
    const receipt = f.state.transaction((repositories) => repositories.connectors.getReceiptByDelivery(delivery.deliveryId));
    assert.equal(receipt.providerMessageId, "mattermost-post-9");
    assert.equal(receipt.providerConversationId, "channel-1");
    assert.equal(receipt.providerThreadId, "root-1");
  } finally { await f.cleanup(); }
});

test("STEP022C doctor proves config, REST authentication, account identity, and WebSocket target without exposing token", async () => {
  const f = await fixture(async () => Response.json({ id: "bot-id", username: "openrill" }));
  try {
    const doctor = await f.runtime.doctor();
    assert.equal(doctor.ok, true);
    assert.deepEqual(doctor.checks.map((check) => check.state), ["PASSED", "PASSED", "PASSED", "PASSED"]);
    assert.equal(JSON.stringify(doctor).includes("private-token"), false);
    assert.equal(Object.hasOwn(doctor, "baseUrl"), false);
  } finally { await f.cleanup(); }
});


test("STEP022C WebSocket ingress persistence failure is retried and forces reconnect instead of silent loss", async () => {
  const sockets = [];
  let receiveAttempts = 0;
  const runtime = new MattermostConnectorRuntime({
    accountId: "main", workspaceId: "alpha", baseUrl: "http://127.0.0.1:8065", botToken: "private-token",
    requireMention: true, allowPrivateNetwork: true, requestTimeoutMs: 2_000, reconnectMinMs: 100, reconnectMaxMs: 1_000, pumpIntervalMs: 50,
  }, {
    port: {
      connectorId: "mattermost", registerAccount(value) { return value; },
      receiveIngress() { receiveAttempts += 1; throw new Error("database unavailable"); },
      drainIngress: async () => ({ processed: 0, adopted: 0, ignored: 0, retried: 0, dead: 0 }),
      enqueueDelivery() { throw new Error("unused"); },
      drainDeliveries: async () => ({ processed: 0, delivered: 0, suppressed: 0, retried: 0, uncertain: 0, dead: 0 }),
    },
    fetchImpl: async () => Response.json({ id: "bot-id", username: "openrill" }),
    websocketFactory: () => { const socket = new MockSocket(); sockets.push(socket); setImmediate(() => socket.emit("open", {})); return socket; },
    sleep: async (_milliseconds, signal) => { if (signal.aborted) throw signal.reason; },
  });
  try {
    await runtime.start();
    sockets[0].emit("message", { data: posted("persist-failure") });
    await waitFor(() => receiveAttempts === 3 && sockets[0].closes.some((item) => item.code === 1011));
    await waitFor(() => sockets.length >= 2);
    assert.equal(receiveAttempts, 3);
  } finally { await runtime.close(); }
});
