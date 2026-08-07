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

async function createConnectorExtension(configRoot) {
  const directory = join(configRoot, "extensions", "fixture.connector");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "openrill.extension.json"), JSON.stringify({
    schemaVersion: 1,
    id: "fixture.connector",
    displayName: "Fixture Connector",
    version: "1.0.0",
    entry: "index.mjs",
    compatibility: { apiVersion: 1, host: { minInclusive: "0.23.0-step022b" } },
    capabilities: [{ kind: "connector", id: "fixture" }],
    configSchema: { additionalProperties: false, fields: [] },
  }, null, 2));
  await writeFile(join(directory, "index.mjs"), `
    export default { activate(context) {
      globalThis.__step022bHostConnectorEvents ??= [];
      const port = context.registerConnector({
        connectorId: "fixture",
        normalizeIngress(claim) { return { kind: "message", route: { workspaceId: "default", externalScopeId: "team:one", externalConversationId: claim.ingress.laneKey }, text: String(claim.ingress.payload.text) }; },
        deliver() { return { kind: "accepted", receipt: { providerMessageId: "fixture-post", receipt: { ok: true } } }; },
      });
      port.registerAccount({ accountId: "main", workspaceId: "default" });
      globalThis.__step022bHostConnectorPort = port;
      globalThis.__step022bHostConnectorEvents.push("activate");
      return { deactivate(reason) { globalThis.__step022bHostConnectorEvents.push("deactivate:" + reason); } };
    } };
  `);
}

test("STEP022B Host activates a real connector adapter, persists ingress before ACK, redacts payload diagnostics, and restarts duplicate-free", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step022b-host-"));
  const configRoot = join(root, "config");
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: configRoot };
  globalThis.__step022bHostConnectorEvents = [];
  let first; let second; let client;
  try {
    await createConnectorExtension(configRoot);
    const config = validateAndMaterializeConfig({ version: 1, extensions: { roots: ["extensions/fixture.connector"], enabled: ["fixture.connector"] } });
    first = await startLocalHost({ profile: "step022b-host", port: 0, env, config, configRoot, workspaceIds: ["default"] });
    await first.ready;
    let connected = await connect(first, "step022b-first"); client = connected.client;
    for (const name of ["connector.account.list", "connector.ingress.list", "connector.delivery.list", "connector.deadLetter.list"]) {
      assert.ok(connected.accepted.capabilities.operations.some((item) => item.name === name));
    }
    assert.deepEqual((await client.call("connector.account.list", {}, 5_000)).items.map((item) => [item.connectorId, item.accountId, item.status]), [["fixture", "main", "ENABLED"]]);
    const firstPort = globalThis.__step022bHostConnectorPort;
    const admitted = firstPort.receiveIngress({ accountId: "main", externalEventId: "event-1", laneKey: "channel:one", payloadVersion: 1, payload: { text: "private inbound text" } });
    assert.equal(admitted.acknowledge, true);
    assert.deepEqual(await firstPort.drainIngress({ accountId: "main" }), { processed: 1, adopted: 1, ignored: 0, retried: 0, dead: 0 });
    const ingress = await client.call("connector.ingress.list", { connectorId: "fixture" }, 5_000);
    assert.equal(ingress.items.length, 1);
    assert.equal(ingress.items[0].status, "ADOPTED");
    assert.equal(Object.hasOwn(ingress.items[0], "payload"), false);
    assert.equal(Object.hasOwn(ingress.items[0], "claimToken"), false);
    assert.equal(Object.hasOwn(ingress.items[0], "lastErrorSummary"), false);
    assert.equal(JSON.stringify(ingress).includes("private inbound text"), false);
    client.close(); client = null;
    await first.close("step022b-first-close"); first = null;
    assert.throws(() => firstPort.receiveIngress({ accountId: "main", externalEventId: "event-2", laneKey: "channel:one", payloadVersion: 1, payload: {} }), (error) => error.code === "CONNECTOR_NOT_REGISTERED");

    second = await startLocalHost({ profile: "step022b-host", port: 0, env, config, configRoot, workspaceIds: ["default"] });
    await second.ready;
    connected = await connect(second, "step022b-second"); client = connected.client;
    assert.deepEqual((await client.call("connector.account.list", {}, 5_000)).items.map((item) => [item.connectorId, item.accountId, item.revision]), [["fixture", "main", 2]]);
    assert.equal((await client.call("connector.ingress.list", {}, 5_000)).items.length, 1);
    client.close(); client = null;
    await second.close("step022b-second-close"); second = null;
    assert.deepEqual(globalThis.__step022bHostConnectorEvents, ["activate", "deactivate:host-stopping", "activate", "deactivate:host-stopping"]);
  } finally {
    client?.close();
    await first?.close("step022b-cleanup"); await second?.close("step022b-cleanup");
    delete globalThis.__step022bHostConnectorPort; delete globalThis.__step022bHostConnectorEvents;
    await rm(root, { recursive: true, force: true });
  }
});
