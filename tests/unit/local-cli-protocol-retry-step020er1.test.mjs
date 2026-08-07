import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalCliProtocolClient, LocalCliProtocolError } from "../../apps/agent-cli/dist/local-protocol-client.js";
import { startLocalHost } from "../../services/agent-host/dist/index.js";

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function metadata(profile, port, instanceId, protocolToken) {
  return {
    schemaVersion: 1,
    product: "OpenRill",
    version: "0.20.6-step020er1",
    profile,
    pid: process.pid,
    instanceId,
    bind: "127.0.0.1",
    port,
    startedAt: new Date().toISOString(),
    state: "READY",
    readiness: true,
    controlToken: "step020er1-control",
    protocolToken,
  };
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test("STEP020ER1 Local CLI retries a transient restart connection refusal within the bounded connect timeout", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step020er1-retry-"));
  const profile = "step020er1-retry";
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config"), NO_COLOR: "1" };
  const port = await reservePort();
  const instanceId = "step020er1-delayed-host";
  const protocolToken = "step020er1-delayed-token";
  const client = new LocalCliProtocolClient(metadata(profile, port, instanceId, protocolToken), "step020er1-test", process.platform);
  let host = null;
  try {
    const connecting = client.connect(2_000);
    await delay(125);
    host = await startLocalHost({
      profile,
      port,
      env,
      workspaceIds: ["default"],
      createInstanceId: () => instanceId,
      createProtocolToken: () => protocolToken,
      createControlToken: () => "step020er1-control",
    });
    await host.ready;
    const accepted = await connecting;
    assert.equal(accepted.server.instanceId, instanceId);
    assert.equal(accepted.server.profile, profile);
  } finally {
    client.close();
    await host?.close("step020er1-retry-cleanup");
    await rm(root, { recursive: true, force: true });
  }
});

test("STEP020ER1 Local CLI keeps the retry loop bounded by the caller connect timeout", async () => {
  const port = await reservePort();
  const client = new LocalCliProtocolClient(metadata("step020er1-timeout", port, "missing-host", "missing-token"), "step020er1-test", process.platform);
  const startedAt = Date.now();
  await assert.rejects(
    () => client.connect(180),
    (error) => error instanceof LocalCliProtocolError && error.code === "PROTOCOL_CONNECT_TIMEOUT" && error.retryable,
  );
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed >= 150, `bounded retry should retain most of the caller window, elapsed=${elapsed}`);
  assert.ok(elapsed < 1_000, "bounded retry must not exceed the caller timeout by an unbounded margin");
});

test("STEP020ER1 Local CLI does not retry a Host identity mismatch", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step020er1-identity-"));
  const profile = "step020er1-identity";
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config"), NO_COLOR: "1" };
  const port = await reservePort();
  const protocolToken = "step020er1-identity-token";
  const host = await startLocalHost({
    profile,
    port,
    env,
    workspaceIds: ["default"],
    createInstanceId: () => "actual-host",
    createProtocolToken: () => protocolToken,
    createControlToken: () => "step020er1-control",
  });
  const client = new LocalCliProtocolClient(metadata(profile, port, "stale-host", protocolToken), "step020er1-test", process.platform);
  try {
    await host.ready;
    const startedAt = Date.now();
    await assert.rejects(
      () => client.connect(1_000),
      (error) => error instanceof LocalCliProtocolError && error.code === "PROTOCOL_HOST_IDENTITY_MISMATCH" && !error.retryable,
    );
    assert.ok(Date.now() - startedAt < 750, "identity mismatch must fail without transport retry backoff");
  } finally {
    client.close();
    await host.close("step020er1-identity-cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
