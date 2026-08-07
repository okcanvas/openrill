import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateExtensionManifest } from "../../packages/extension-sdk/dist/index.js";
import extension from "../../connectors/mattermost/dist/extension.js";

class MockSocket {
  readyState = 0;
  sent = [];
  listeners = new Map();
  addEventListener(type, listener) { const list = this.listeners.get(type) ?? []; list.push(listener); this.listeners.set(type, list); }
  removeEventListener(type, listener) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter((entry) => entry !== listener)); }
  send(value) { this.sent.push(value); }
  close(code = 1000, reason = "closed") { this.readyState = 3; for (const listener of this.listeners.get("close") ?? []) listener({ code, reason }); }
  open() { this.readyState = 1; for (const listener of this.listeners.get("open") ?? []) listener({}); }
}

test("STEP022C packaged Mattermost Extension manifest is closed, compatible, and secret-only for bot token", async () => {
  const manifest = JSON.parse(await readFile(resolve("connectors/mattermost/openrill.extension.json"), "utf8"));
  const checked = validateExtensionManifest(manifest);
  assert.equal(checked.ok, true);
  assert.equal(checked.value.id, "openrill.connector.mattermost");
  assert.deepEqual(checked.value.capabilities, [{ kind: "connector", id: "mattermost" }]);
  const token = checked.value.configSchema.fields.find((field) => field.key === "botToken");
  assert.deepEqual({ kind: token.kind, required: token.required }, { kind: "secret", required: true });
  assert.equal(checked.value.configSchema.additionalProperties, false);
});

test("STEP022C actual Extension activation registers one adapter, authenticates, and deactivates cleanly", async () => {
  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;
  const sockets = [];
  let adapter;
  let account;
  try {
    globalThis.fetch = async () => Response.json({ id: "bot-id", username: "openrill" });
    globalThis.WebSocket = class { constructor() { const socket = new MockSocket(); sockets.push(socket); setImmediate(() => socket.open()); return socket; } };
    const runtime = await extension.activate({
      extensionId: "openrill.connector.mattermost",
      manifest: JSON.parse(await readFile(resolve("connectors/mattermost/openrill.extension.json"), "utf8")),
      config: { workspaceId: "alpha", baseUrl: "http://127.0.0.1:8065", allowPrivateNetwork: true, requestTimeoutMs: 2_000, reconnectMinMs: 100, reconnectMaxMs: 1_000, pumpIntervalMs: 50 },
      signal: new AbortController().signal,
      claimCapability() { throw new Error("registerConnector owns the connector capability claim"); },
      registerConnector(value) { adapter = value; return { connectorId: "mattermost", registerAccount(value) { account = value; return { ...value }; }, receiveIngress() { return { acknowledge: true }; }, drainIngress: async () => ({ processed: 0, adopted: 0, ignored: 0, retried: 0, dead: 0 }), enqueueDelivery() { throw new Error("unused"); }, drainDeliveries: async () => ({ processed: 0, delivered: 0, suppressed: 0, retried: 0, uncertain: 0, dead: 0 }) }; },
      resolveSecret: async (key) => key === "botToken" ? "private-token" : "",
    });
    assert.equal(adapter.connectorId, "mattermost");
    assert.deepEqual(account, { accountId: "main", workspaceId: "alpha" });
    assert.equal(JSON.parse(sockets[0].sent[0]).action, "authentication_challenge");
    assert.deepEqual(Object.keys(adapter.status()).sort(), ["accountId", "connectorId", "healthy", "lastConnectedAt", "lastDeliveryAt", "lastErrorCode", "lastEventAt", "lastIngressAt", "reconnectAttempt", "state"]);
    const doctor = await adapter.doctor(new AbortController().signal);
    assert.equal(doctor.ok, true);
    assert.equal(JSON.stringify(doctor).includes("private-token"), false);
    await runtime.deactivate("test-complete");
    assert.equal(sockets[0].readyState, 3);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWebSocket === undefined) delete globalThis.WebSocket;
    else globalThis.WebSocket = originalWebSocket;
  }
});
