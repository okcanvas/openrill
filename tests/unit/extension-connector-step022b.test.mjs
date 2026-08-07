import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { ConnectorAdapterRegistry, ConnectorRuntimeService } from "../../packages/connectors/dist/index.js";
import { LocalExtensionRuntimeRegistry } from "../../services/agent-host/dist/extension-runtime.js";

async function writeConnectorExtension(root, id, connectorId, source) {
  const directory = join(root, id);
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, "openrill.extension.json"), JSON.stringify({
    schemaVersion: 1,
    id,
    displayName: id,
    version: "1.0.0",
    entry: "index.mjs",
    compatibility: { apiVersion: 1, host: { minInclusive: "0.22.0-step022a", maxExclusive: "0.24.0" } },
    capabilities: [{ kind: "connector", id: connectorId }],
    configSchema: { additionalProperties: false, fields: [] },
  }, null, 2));
  await writeFile(join(directory, "index.mjs"), source);
  return directory;
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "openrill-step022b-extension-connector-"));
  const paths = resolveProfilePaths({ profile: "connector-extension", env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  let next = 0;
  const conversations = new ConversationService({ state, workspaceIds: ["alpha"], createId: () => `ext-${++next}` });
  const service = new ConnectorRuntimeService({ state, conversations, workspaceIds: ["alpha"], createId: () => `connector-${++next}` });
  const connectors = new ConnectorAdapterRegistry({ service });
  return { root, state, conversations, service, connectors, cleanup: async () => { if (state.isOpen()) state.close(); await rm(root, { recursive: true, force: true }); } };
}

test("STEP022B Extension connector capability requires one real Host adapter registration and unregisters on lifecycle abort", async () => {
  const f = await fixture();
  globalThis.__step022bConnector = {};
  try {
    await writeConnectorExtension(f.root, "fixture.connector", "fixture", `
      export default { activate(context) {
        globalThis.__step022bConnector.keys = Object.keys(context).sort();
        const port = context.registerConnector({
          connectorId: "fixture",
          normalizeIngress(claim) { return { kind: "message", route: { workspaceId: "alpha", externalScopeId: "team:one", externalConversationId: claim.ingress.laneKey }, text: String(claim.ingress.payload.text) }; },
          deliver() { return { kind: "accepted", receipt: { providerMessageId: "post-1", receipt: { ok: true } } }; },
        });
        port.registerAccount({ accountId: "main", workspaceId: "alpha" });
        globalThis.__step022bConnector.port = port;
        return { deactivate(reason) { globalThis.__step022bConnector.reason = reason; } };
      } };
    `);
    const registry = new LocalExtensionRuntimeRegistry({
      hostVersion: "0.23.0-step022b", configRoot: f.root, roots: ["fixture.connector"], enabled: ["fixture.connector"], settings: {}, env: {}, connectorRegistry: f.connectors,
    });
    assert.equal((await registry.startConfigured())[0].state, "READY");
    assert.deepEqual(globalThis.__step022bConnector.keys, ["claimCapability", "config", "extensionId", "manifest", "registerConnector", "resolveSecret", "signal"]);
    assert.equal(f.connectors.list().length, 1);
    const port = globalThis.__step022bConnector.port;
    assert.equal(port.receiveIngress({ accountId: "main", externalEventId: "event-1", laneKey: "channel:one", payloadVersion: 1, payload: { text: "hello" } }).acknowledge, true);
    assert.deepEqual(await port.drainIngress({ accountId: "main" }), { processed: 1, adopted: 1, ignored: 0, retried: 0, dead: 0 });
    const conversation = f.conversations.list({ workspaceId: "alpha" })[0];
    port.enqueueDelivery({ accountId: "main", conversationId: conversation.conversationId, targetKey: "channel:one", payloadVersion: 1, payload: { text: "reply" }, idempotencyKey: "reply-1" });
    assert.deepEqual(await port.drainDeliveries({ accountId: "main" }), { processed: 1, delivered: 1, suppressed: 0, retried: 0, uncertain: 0, dead: 0 });
    await registry.close();
    assert.equal(f.connectors.list().length, 0);
    assert.equal(globalThis.__step022bConnector.reason, "host-stopping");
    assert.throws(() => port.registerAccount({ accountId: "other", workspaceId: "alpha" }), (error) => error.code === "CONNECTOR_NOT_REGISTERED");
  } finally {
    delete globalThis.__step022bConnector;
    await f.cleanup();
  }
});

test("STEP022B connector declaration cannot become READY through claimCapability without registering an adapter", async () => {
  const f = await fixture();
  try {
    await writeConnectorExtension(f.root, "claim-only.connector", "claim-only", `
      export default { activate(context) { context.claimCapability({ kind: "connector", id: "claim-only" }); return { deactivate() {} }; } };
    `);
    const registry = new LocalExtensionRuntimeRegistry({
      hostVersion: "0.23.0-step022b", configRoot: f.root, roots: ["claim-only.connector"], enabled: ["claim-only.connector"], settings: {}, env: {}, connectorRegistry: f.connectors,
    });
    const view = (await registry.startConfigured())[0];
    assert.equal(view.state, "FAILED");
    assert.equal(view.issue.code, "MODULE_INVALID");
    assert.equal(f.connectors.list().length, 0);
  } finally {
    await f.cleanup();
  }
});

test("STEP022B Extension cannot register a connector adapter not declared by its manifest", async () => {
  const f = await fixture();
  try {
    await writeConnectorExtension(f.root, "mismatch.connector", "declared", `
      export default { activate(context) { context.registerConnector({ connectorId: "different", normalizeIngress() { return { kind: "ignored", reason: "none" }; }, deliver() { return { kind: "suppressed", reason: "none" }; } }); return { deactivate() {} }; } };
    `);
    const registry = new LocalExtensionRuntimeRegistry({
      hostVersion: "0.23.0-step022b", configRoot: f.root, roots: ["mismatch.connector"], enabled: ["mismatch.connector"], settings: {}, env: {}, connectorRegistry: f.connectors,
    });
    const view = (await registry.startConfigured())[0];
    assert.equal(view.state, "FAILED");
    assert.equal(view.issue.code, "MODULE_INVALID");
    assert.equal(f.connectors.list().length, 0);
  } finally {
    await f.cleanup();
  }
});
