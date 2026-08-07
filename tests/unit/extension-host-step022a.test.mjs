import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalCliProtocolClient } from "../../apps/agent-cli/dist/local-protocol-client.js";
import { readHostMetadata, startLocalHost } from "../../services/agent-host/dist/index.js";
import { validateAndMaterializeConfig } from "../../packages/config/dist/index.js";

async function connect(host, id) {
  const metadata = await readHostMetadata(host.paths);
  assert.ok(metadata);
  const client = new LocalCliProtocolClient(metadata, id, process.platform);
  const accepted = await client.connect();
  return { client, accepted };
}

async function createHostExtension(configRoot) {
  const directory = join(configRoot, "extensions", "host.local");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "openrill.extension.json"), JSON.stringify({
    schemaVersion: 1,
    id: "host.local",
    displayName: "Host Local",
    version: "1.0.0",
    entry: "index.mjs",
    compatibility: { apiVersion: 1, host: { minInclusive: "0.22.0-step022a", maxExclusive: "1.0.0" } },
    capabilities: [{ kind: "tool", id: "host-local" }],
    configSchema: { additionalProperties: false, fields: [] },
  }, null, 2));
  await writeFile(join(directory, "index.mjs"), `
    export default { activate(context) {
      globalThis.__step022aHostEvents ??= [];
      globalThis.__step022aHostEvents.push("activate:" + context.extensionId);
      context.claimCapability({ kind: "tool", id: "host-local" });
      return { deactivate(reason) { globalThis.__step022aHostEvents.push("deactivate:" + reason); } };
    } };
  `);
}

test("STEP022A Host starts configured Extensions, exposes protocol lifecycle operations, and restarts without duplicate registration", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step022a-host-"));
  const configRoot = join(root, "config");
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: configRoot };
  globalThis.__step022aHostEvents = [];
  let first;
  let secondHost;
  let firstClient;
  let secondClient;
  try {
    await createHostExtension(configRoot);
    const config = validateAndMaterializeConfig({
      version: 1,
      extensions: { roots: ["extensions/host.local"], enabled: ["host.local"] },
    });
    first = await startLocalHost({ profile: "step022a-host", port: 0, env, config, configRoot });
    await first.ready;
    const firstConnection = await connect(first, "step022a-first");
    firstClient = firstConnection.client;
    const operationNames = firstConnection.accepted.capabilities.operations.map((entry) => entry.name);
    for (const operation of ["extension.list", "extension.get", "extension.enable", "extension.disable"]) assert.ok(operationNames.includes(operation));
    let listed = await firstClient.call("extension.list", {}, 5_000);
    assert.deepEqual(listed.items.map((item) => [item.extensionId, item.state, item.activationSequence]), [["host.local", "READY", 1]]);
    assert.equal((await firstClient.call("extension.disable", { extensionId: "host.local" }, 5_000)).state, "DISABLED");
    assert.equal((await firstClient.call("extension.enable", { extensionId: "host.local" }, 5_000)).state, "READY");
    listed = await firstClient.call("extension.list", {}, 5_000);
    assert.equal(listed.items.length, 1);
    firstClient.close(); firstClient = null;
    await first.close("step022a-first-close"); first = null;

    secondHost = await startLocalHost({ profile: "step022a-host", port: 0, env, config, configRoot });
    await secondHost.ready;
    ({ client: secondClient } = await connect(secondHost, "step022a-second"));
    listed = await secondClient.call("extension.list", {}, 5_000);
    assert.deepEqual(listed.items.map((item) => [item.extensionId, item.state, item.activationSequence]), [["host.local", "READY", 1]]);
    assert.equal(listed.items[0].capabilities.length, 1);
    secondClient.close(); secondClient = null;
    await secondHost.close("step022a-second-close"); secondHost = null;

    assert.deepEqual(globalThis.__step022aHostEvents, [
      "activate:host.local",
      "deactivate:runtime-disable",
      "activate:host.local",
      "deactivate:host-stopping",
      "activate:host.local",
      "deactivate:host-stopping",
    ]);
  } finally {
    firstClient?.close(); secondClient?.close();
    await first?.close("step022a-cleanup"); await secondHost?.close("step022a-cleanup");
    delete globalThis.__step022aHostEvents;
    await rm(root, { recursive: true, force: true });
  }
});


test("STEP022A Host treats a legacy materialized Config without extensions as an empty registry", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step022a-legacy-config-"));
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
  let host; let client;
  try {
    const current = validateAndMaterializeConfig({ version: 1 });
    const { extensions: _extensions, ...legacyConfig } = current;
    host = await startLocalHost({ profile: "step022a-legacy-config", port: 0, env, config: legacyConfig });
    await host.ready;
    ({ client } = await connect(host, "step022a-legacy"));
    const listed = await client.call("extension.list", {}, 5_000);
    assert.deepEqual(listed.items, []);
  } finally {
    client?.close();
    await host?.close("step022a-legacy-cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
