import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { LocalCliProtocolClient } from "../../apps/agent-cli/dist/local-protocol-client.js";
import { validateAndMaterializeConfig } from "../../packages/config/dist/index.js";
import { createScriptedModelAdapter } from "../../packages/model-adapter/dist/index.js";
import { readHostMetadata, startLocalHost } from "../../services/agent-host/dist/index.js";

class MockSocket {
  readyState = 0;
  sent = [];
  #listeners = new Map();
  addEventListener(type, listener) { const list = this.#listeners.get(type) ?? []; list.push(listener); this.#listeners.set(type, list); }
  removeEventListener(type, listener) { this.#listeners.set(type, (this.#listeners.get(type) ?? []).filter((entry) => entry !== listener)); }
  send(data) { this.sent.push(data); }
  close(code = 1000, reason = "closed") { if (this.readyState === 3) return; this.readyState = 3; this.emit("close", { code, reason }); }
  emit(type, event = {}) { if (type === "open") this.readyState = 1; for (const listener of [...(this.#listeners.get(type) ?? [])]) listener(event); }
}

async function waitFor(predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));
  }
  throw new Error(`condition not reached within ${timeoutMs}ms`);
}

async function connect(host, id) {
  const metadata = await readHostMetadata(host.paths);
  assert.ok(metadata);
  const client = new LocalCliProtocolClient(metadata, id, process.platform);
  const accepted = await client.connect();
  return { client, accepted };
}

function resolver(adapter) {
  return { resolve: () => ({ profile: "default", adapter, provider: "fixture", model: "fixture-model", maxOutputTokens: 256, maxRetries: 0 }) };
}

async function writeMattermostExtension(configRoot) {
  const directory = join(configRoot, "extensions with spaces", "mattermost");
  await mkdir(join(directory, "dist"), { recursive: true });
  const manifest = JSON.parse(await readFile(resolve("connectors/mattermost/openrill.extension.json"), "utf8"));
  await writeFile(join(directory, "openrill.extension.json"), JSON.stringify(manifest, null, 2));
  const extensionUrl = pathToFileURL(resolve("connectors/mattermost/dist/extension.js")).href;
  await writeFile(join(directory, "dist", "extension.js"), `export { default } from ${JSON.stringify(extensionUrl)};\n`);
}

function posted(id = "post-1") {
  return JSON.stringify({ event: "posted", data: { post: JSON.stringify({ id, user_id: "user-1", channel_id: "channel-1", message: "@openrill complete the live vertical slice", root_id: "root-1", type: "", create_at: 100 }), channel_type: "O", team_id: "team-1", sender_name: "alice" }, broadcast: { channel_id: "channel-1", user_id: "user-1", team_id: "team-1" } });
}

test("STEP022C Host runs Mattermost ingress through Agent completion to one durable threaded receipt and restarts duplicate-free", async () => {
  const root = await mkdtemp(join(tmpdir(), "OpenRill STEP022C Host "));
  const configRoot = join(root, "config root");
  const workspace = join(root, "workspace");
  await mkdir(workspace, { recursive: true });
  const env = { OPENRILL_DATA_ROOT: join(root, "data root"), OPENRILL_CONFIG_ROOT: configRoot, OPENRILL_MATTERMOST_BOT_TOKEN: "private-token" };
  const sockets = [];
  const posts = [];
  const originalFetch = globalThis.fetch;
  const originalWebSocket = globalThis.WebSocket;
  let first; let second; let client;
  try {
    await writeMattermostExtension(configRoot);
    globalThis.fetch = async (input, init = {}) => {
      const url = String(input);
      if (url.endsWith("/users/me")) return Response.json({ id: "bot-id", username: "openrill" });
      if (url.endsWith("/posts") && init.method === "POST") {
        const body = JSON.parse(String(init.body)); posts.push(body);
        return Response.json({ id: `reply-${posts.length}`, channel_id: body.channel_id, root_id: body.root_id ?? "", create_at: 200 + posts.length });
      }
      return new Response("not found", { status: 404 });
    };
    assert.equal(typeof originalWebSocket, "function");
    globalThis.WebSocket = class {
      static CONNECTING = originalWebSocket.CONNECTING;
      static OPEN = originalWebSocket.OPEN;
      static CLOSING = originalWebSocket.CLOSING;
      static CLOSED = originalWebSocket.CLOSED;
      constructor(url, protocols) {
        if (String(url).includes("127.0.0.1:8065/api/v4/websocket")) {
          const socket = new MockSocket(); sockets.push(socket); setImmediate(() => socket.emit("open", {})); return socket;
        }
        return new originalWebSocket(url, protocols);
      }
    };
    const config = validateAndMaterializeConfig({
      version: 1,
      modelProviders: { default: { type: "fixture" } },
      workspaces: [{ id: "default", path: workspace }],
      extensions: {
        roots: ["extensions with spaces/mattermost"], enabled: ["openrill.connector.mattermost"],
        settings: { "openrill.connector.mattermost": {
          values: { accountId: "main", workspaceId: "default", baseUrl: "http://127.0.0.1:8065", requireMention: true, allowPrivateNetwork: true, requestTimeoutMs: 2_000, reconnectMinMs: 100, reconnectMaxMs: 1_000, pumpIntervalMs: 50 },
          secrets: { botToken: { kind: "env", key: "OPENRILL_MATTERMOST_BOT_TOKEN" } },
        } },
      },
    });
    const firstAdapter = createScriptedModelAdapter({ turns: [{ kind: "events", events: [
      { type: "text_delta", delta: "STEP022C durable Mattermost reply" },
      { type: "completed", stopReason: "stop" },
    ] }] });
    first = await startLocalHost({ profile: "step022c-host", port: 0, env, config, configRoot, workspaceIds: ["default"], modelResolver: resolver(firstAdapter) });
    await first.ready;
    let connected = await connect(first, "step022c-first"); client = connected.client;
    for (const operation of ["connector.status", "connector.doctor"]) assert.ok(connected.accepted.capabilities.operations.some((item) => item.name === operation));
    const status = await client.call("connector.status", { connectorId: "mattermost" }, 5_000);
    assert.deepEqual({ state: status.state, healthy: status.healthy, accountId: status.accountId }, { state: "CONNECTED", healthy: true, accountId: "main" });
    sockets[0].emit("message", { data: posted() });
    await waitFor(() => posts.length === 1);
    assert.deepEqual(posts, [{ channel_id: "channel-1", message: "STEP022C durable Mattermost reply", root_id: "root-1" }]);
    const deliveries = await waitFor(async () => {
      const result = await client.call("connector.delivery.list", { connectorId: "mattermost", status: "DELIVERED" }, 5_000);
      return result.items.length === 1 ? result : null;
    });
    assert.equal(deliveries.items[0].attemptCount, 1);
    const ingress = await client.call("connector.ingress.list", { connectorId: "mattermost", status: "ADOPTED" }, 5_000);
    assert.equal(ingress.items.length, 1);
    const conversation = await client.call("conversation.get", { workspaceId: "default", conversationId: ingress.items[0].bindingId ? (await client.call("conversation.list", { workspaceId: "default" }, 5_000)).items[0].conversationId : "" }, 5_000);
    assert.equal(conversation.runs.some((run) => run.status === "COMPLETED"), true);
    const doctor = await client.call("connector.doctor", { connectorId: "mattermost" }, 5_000);
    assert.equal(doctor.ok, true);
    assert.equal(JSON.stringify(doctor).includes("private-token"), false);
    assert.equal(Object.hasOwn(doctor, "baseUrl"), false);
    client.close(); client = null;
    await first.close("step022c-first-close"); first = null;

    second = await startLocalHost({ profile: "step022c-host", port: 0, env, config, configRoot, workspaceIds: ["default"], modelResolver: resolver(createScriptedModelAdapter({ turns: [] })) });
    await second.ready;
    connected = await connect(second, "step022c-second"); client = connected.client;
    assert.equal((await client.call("connector.ingress.list", { connectorId: "mattermost" }, 5_000)).items.length, 1);
    assert.equal((await client.call("connector.delivery.list", { connectorId: "mattermost" }, 5_000)).items.length, 1);
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    assert.equal(posts.length, 1);
  } finally {
    client?.close();
    await first?.close("step022c-cleanup"); await second?.close("step022c-cleanup");
    globalThis.fetch = originalFetch;
    if (originalWebSocket === undefined) delete globalThis.WebSocket; else globalThis.WebSocket = originalWebSocket;
    await rm(root, { recursive: true, force: true });
  }
});
