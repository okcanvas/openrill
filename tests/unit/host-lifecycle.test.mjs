import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { HostLifecycleError, inspectLocalHost, startLocalHost, stopLocalHost } from "../../services/agent-host/dist/index.js";

async function tempEnv() {
  const root = await mkdtemp(join(tmpdir(), "openrill-step002-"));
  return { root, env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } };
}

async function occupyPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return { port: address.port, close: () => new Promise((resolve, reject) => server.close((e) => e ? reject(e) : resolve())) };
}

test("Host exposes LISTENING before READY, enforces one instance, and stop is idempotent", async () => {
  const { root, env } = await tempEnv();
  const first = await startLocalHost({ profile: "one", port: 0, env, readyDelayMs: 80 });
  assert.equal(first.status().state, "LISTENING");
  const during = await inspectLocalHost(first.paths);
  assert.equal(during.running, true);
  assert.equal(during.status?.state, "LISTENING");
  await assert.rejects(() => startLocalHost({ profile: "one", port: 0, env }), (error) => error instanceof HostLifecycleError && error.code === "HOST_ALREADY_RUNNING");
  const second = await startLocalHost({ profile: "two", port: 0, env });
  assert.equal((await first.ready).state, "READY");
  assert.equal((await second.ready).state, "READY");
  assert.equal((await stopLocalHost(first.paths)).reason, "STOPPED");
  await first.closed;
  assert.equal((await stopLocalHost(first.paths)).reason, "ALREADY_STOPPED");
  await second.close();
  await rm(root, { recursive: true, force: true });
});

test("dead lock is reclaimed and live unverified lock requires explicit force", async () => {
  const { root, env } = await tempEnv();
  const paths = resolveProfilePaths({ profile: "stale", env });
  await mkdir(paths.runtimeDir, { recursive: true });
  await writeFile(paths.lockPath, JSON.stringify({ schemaVersion: 1, product: "OpenRill", version: "old", profile: "stale", pid: 99999999, instanceId: "dead-instance", createdAt: "2000-01-01T00:00:00.000Z" }));
  const reclaimed = await startLocalHost({ profile: "stale", port: 0, env });
  await reclaimed.ready;
  await reclaimed.close();

  await writeFile(paths.lockPath, JSON.stringify({ schemaVersion: 1, product: "OpenRill", version: "old", profile: "stale", pid: process.pid, instanceId: "live-unverified", createdAt: "2000-01-01T00:00:00.000Z" }));
  await assert.rejects(() => startLocalHost({ profile: "stale", port: 0, env }), (error) => error instanceof HostLifecycleError && error.code === "HOST_LOCK_UNVERIFIED");
  const forced = await startLocalHost({ profile: "stale", port: 0, env, force: true, forceMinimumAgeMs: 0 });
  await forced.ready;
  await forced.close();
  await rm(root, { recursive: true, force: true });
});

test("port conflict rolls back lock and metadata without orphan listener", async () => {
  const { root, env } = await tempEnv();
  const occupied = await occupyPort();
  const paths = resolveProfilePaths({ profile: "port-conflict", env });
  await assert.rejects(() => startLocalHost({ profile: "port-conflict", port: occupied.port, env }), (error) => error instanceof HostLifecycleError && error.code === "HOST_STARTUP_FAILED");
  await assert.rejects(readFile(paths.lockPath));
  await assert.rejects(readFile(paths.metadataPath));
  await occupied.close();
  await rm(root, { recursive: true, force: true });
});
