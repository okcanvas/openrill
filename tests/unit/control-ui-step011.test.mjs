import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  LocalProtocolClient,
  applyControlUiNotice,
  createControlUiProjection,
} from "../../apps/agent-web/dist/index.js";
import {
  ControlUiService,
  NoticeWindow,
  createLifecycleRequestHandler,
} from "../../services/agent-host/dist/index.js";

function fixture(cursor = 0) {
  return {
    fixtureId: "step011",
    initialCursor: cursor,
    snapshot: { conversation: {}, run: {}, cards: [] },
  };
}

test("actual Agent progress envelope projects model.text_delta as text", () => {
  const state = createControlUiProjection(fixture());
  const result = applyControlUiNotice(state, {
    sequence: 1,
    notice: "run.event",
    payload: { runId: "run-1", type: "model.text_delta", data: { delta: "hello" } },
  });
  assert.equal(result.outcome, "APPLIED");
  assert.deepEqual(state.cards, [{ kind: "text", runId: "run-1", text: "hello" }]);
});

test("unknown progress envelopes remain visible instead of being discarded", () => {
  const state = createControlUiProjection(fixture());
  applyControlUiNotice(state, {
    sequence: 1,
    notice: "run.event",
    payload: { runId: "run-1", type: "future.progress", data: { value: 3 } },
  });
  assert.equal(state.cards[0]?.kind, "unknown");
  assert.equal(state.cards[0]?.title, "future.progress");
});

test("NoticeWindow accepted cursor remains the replay base", () => {
  const notices = new NoticeWindow(8, () => 1_700_000_000_000);
  notices.publish("one", {});
  notices.publish("two", {});
  const replay = notices.replayAfter(0);
  assert.equal(replay.resyncRequired, false);
  assert.equal(replay.cursor, 0);
  assert.deepEqual(replay.notices.map((item) => item.sequence), [1, 2]);
});

test("LocalProtocolClient detects a gap without advancing its durable cursor", async () => {
  const original = globalThis.WebSocket;
  let socket;
  class FakeWebSocket extends EventTarget {
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = 0;
    constructor() { super(); socket = this; queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event("open")); }); }
    send(value) {
      const frame = JSON.parse(String(value));
      if (frame.type === "open") queueMicrotask(() => this.message({
        type: "accepted", protocol: 1, connectionId: "connection-1",
        server: { product: "OpenRill", version: "test", profile: "test", instanceId: "instance-1" },
        capabilities: { operations: [], notices: [] }, snapshot: { host: {} }, cursor: 3, resyncRequired: false,
      }));
    }
    message(value) { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(value) })); }
    close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
  }
  globalThis.WebSocket = FakeWebSocket;
  try {
    const client = new LocalProtocolClient({ url: "ws://test/protocol", token: "token", clientId: "test", clientVersion: "test", platform: "test", cursor: 3 });
    const gaps = [];
    const notices = [];
    client.onGap((gap) => gaps.push(gap));
    client.onNotice((notice) => notices.push(notice));
    await client.connect();
    socket.message({ type: "notice", topic: "run.updated", sequence: 5, emittedAt: new Date().toISOString(), data: {} });
    assert.equal(client.currentCursor, 3);
    assert.equal(client.connectionState, "RESYNC_REQUIRED");
    assert.deepEqual(gaps, [{ expected: 4, received: 5, cursor: 3 }]);
    assert.equal(notices.length, 0);
    client.close();
  } finally { globalThis.WebSocket = original; }
});

test("ControlUiService exposes public workspace and artifact metadata without private paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step011-artifact-"));
  const artifactRoot = join(root, "private", "artifact-1");
  await mkdir(artifactRoot, { recursive: true });
  await writeFile(join(artifactRoot, "result.txt"), "artifact-content", "utf8");
  await writeFile(join(artifactRoot, "metadata.json"), "{}", "utf8");
  const workspace = { workspaceId: "main", displayName: "Main", canonicalRoot: join(root, "workspace"), rootRevision: "a".repeat(64), accessMode: "READ_WRITE", trustState: "CONFIGURED_LOCAL", updatedAt: 1 };
  const artifact = { artifactId: "artifact-1", runId: "run-1", attemptId: "attempt-1", workspaceId: "main", kind: "READ_OUTPUT", relativePath: "notes.txt", operation: "workspace.read", beforeSha256: null, afterSha256: null, storagePath: artifactRoot, sizeBytes: 16, createdAt: 2 };
  const repositories = { workspaces: {
    listWorkspaces: () => [workspace], listRecentArtifacts: () => [artifact], listArtifacts: () => [artifact], getArtifact: (id) => id === artifact.artifactId ? artifact : null,
  } };
  const service = new ControlUiService({ transaction: (callback) => callback(repositories) });
  try {
    const workspaces = service.listWorkspaces();
    const artifacts = await service.listArtifacts({ limit: 10 });
    const serialized = JSON.stringify({ workspaces, artifacts });
    assert.equal(serialized.includes(workspace.canonicalRoot), false);
    assert.equal(serialized.includes(artifact.storagePath), false);
    assert.deepEqual(artifacts.items[0].files, [{ name: "result.txt", sizeBytes: 16, mediaType: "text/plain; charset=utf-8" }]);
    const content = await service.readArtifactContent("artifact-1", "result.txt");
    assert.equal(content?.bytes.toString("utf8"), "artifact-content");
    assert.equal(await service.readArtifactContent("artifact-1", "../metadata.json"), null);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("same-origin Control UI bootstrap, static assets, and authenticated artifacts are separated", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step011-http-"));
  await mkdir(join(root, "assets"), { recursive: true });
  await writeFile(join(root, "index.html"), "<!doctype html><div id=app></div>", "utf8");
  await writeFile(join(root, "assets", "app.js"), "console.log('ui')", "utf8");
  let port = 0;
  const status = () => ({ product: "OpenRill", version: "test", profile: "profile", pid: process.pid, instanceId: "instance", bind: "127.0.0.1", port, startedAt: new Date().toISOString(), state: "READY", readiness: true });
  const server = createServer(createLifecycleRequestHandler({
    controlToken: "control-token", protocolToken: "protocol-token", controlUiRoot: root, getStatus: status,
    getControlUiWorkspaces: () => [{ workspaceId: "main", displayName: "Main", rootRevision: "r", accessMode: "READ_WRITE", trustState: "CONFIGURED_LOCAL", updatedAt: 1 }],
    readArtifactContent: async (artifactId, fileName) => artifactId === "artifact-1" && fileName === "result.txt"
      ? { artifactId, fileName, mediaType: "text/plain; charset=utf-8", bytes: Buffer.from("artifact") } : null,
    requestStop: () => true,
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.equal((await page.text()).includes("protocol-token"), false);
    assert.match(page.headers.get("content-security-policy") ?? "", /script-src 'self' 'sha256-/);
    const bootstrap = await fetch(`${base}/ui/bootstrap`);
    assert.equal(bootstrap.headers.get("cache-control"), "no-store");
    assert.equal((await bootstrap.json()).protocol.token, "protocol-token");
    const denied = await fetch(`${base}/ui/artifacts/artifact-1/content?file=result.txt`);
    assert.equal(denied.status, 401);
    const allowed = await fetch(`${base}/ui/artifacts/artifact-1/content?file=result.txt`, { headers: { authorization: "Bearer protocol-token" } });
    assert.equal(await allowed.text(), "artifact");
    const proxied = await fetch(`${base}/`, { headers: { "x-forwarded-host": "attacker.example" } });
    assert.equal(proxied.status, 403);
  } finally { await new Promise((resolve) => server.close(resolve)); await rm(root, { recursive: true, force: true }); }
});

test("built browser assets include app and protocol modules with no private storage imports", async () => {
  const root = new URL("../../apps/agent-web/dist/public/", import.meta.url);
  const app = await readFile(new URL("assets/web/browser-app.js", root), "utf8");
  const client = await readFile(new URL("assets/web/api/local-protocol-client.js", root), "utf8");
  const protocol = await readFile(new URL("assets/protocol/index.js", root), "utf8");
  assert.match(app, /data-framework/);
  assert.match(client, /@openrill\/protocol/);
  assert.match(protocol, /OPENRILL_PROTOCOL_FAMILY/);
  for (const source of [app, client]) {
    assert.doesNotMatch(source, /node:sqlite|node:fs|storagePath|canonicalRoot/);
  }
});
