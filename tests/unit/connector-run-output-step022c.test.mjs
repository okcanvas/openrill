import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { ConnectorRuntimeService } from "../../packages/connectors/dist/index.js";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "openrill-step022c-output-"));
  const paths = resolveProfilePaths({ profile: "step022c-output", env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  const state = await openOpenRillStateDatabase({ profilePaths: paths });
  let n = 0;
  const conversations = new ConversationService({ state, workspaceIds: ["alpha"], createId: () => `id-${++n}`, now: () => 1_000 + n });
  const service = new ConnectorRuntimeService({ state, conversations, workspaceIds: ["alpha"], createId: () => `connector-${++n}`, now: () => 2_000 + n });
  service.registerAccount({ connectorId: "mattermost", accountId: "main", workspaceId: "alpha", extensionId: "openrill.connector.mattermost" });
  return { root, state, conversations, service, cleanup: async () => { if (state.isOpen()) state.close(); await rm(root, { recursive: true, force: true }); } };
}

function usage() { return { turns: 1, inputTokens: 2, outputTokens: 3, modelCalls: 1, toolCalls: 0 }; }

test("STEP022C completed Connector Run projects one idempotent durable delivery to the original channel and thread", async () => {
  const f = await fixture();
  try {
    f.service.receiveIngress("mattermost", { accountId: "main", externalEventId: "post-1", laneKey: "channel-1:root-1", payloadVersion: 1, payload: { event: "posted" } });
    const claim = f.service.claimIngress("mattermost", "main");
    const adopted = f.service.adoptIngress(claim, { workspaceId: "alpha", externalScopeId: "team:one", externalConversationId: "channel-1", externalThreadId: "root-1" }, "hello");
    f.conversations.startExecution({ runId: adopted.runId, providerId: "fixture", modelId: "fixture", budget: { maxTurns: 2, maxModelCalls: 2, maxToolCalls: 1, maxOutputTokens: 64, maxTotalTokens: 256, maxDurationMs: 30_000 } });
    f.conversations.appendExecutionMessage({ runId: adopted.runId, role: "assistant", content: { type: "assistant", text: "durable reply", reasoningSummary: "private", toolCalls: [] } });
    f.conversations.completeExecution(adopted.runId, usage(), "stop", "durable reply");
    const first = f.service.projectRunOutput(adopted.runId);
    const replay = f.service.projectRunOutput(adopted.runId);
    assert.equal(first.kind, "delivery");
    assert.equal(first.replayed, false);
    assert.equal(replay.kind, "delivery");
    assert.equal(replay.replayed, true);
    assert.equal(first.delivery.targetKey, "channel-1");
    assert.equal(first.delivery.threadKey, "root-1");
    assert.deepEqual(first.delivery.payload, { type: "text", text: "durable reply" });
    assert.equal(f.service.listDeliveries({ connectorId: "mattermost" }).length, 1);
  } finally { await f.cleanup(); }
});

test("STEP022C startup recovery replays completed connector Run projection without duplicate delivery", async () => {
  const f = await fixture();
  try {
    f.service.receiveIngress("mattermost", { accountId: "main", externalEventId: "post-2", laneKey: "channel-2:root", payloadVersion: 1, payload: { event: "posted" } });
    const claim = f.service.claimIngress("mattermost", "main");
    const adopted = f.service.adoptIngress(claim, { workspaceId: "alpha", externalScopeId: "team:one", externalConversationId: "channel-2" }, "hello");
    f.conversations.startExecution({ runId: adopted.runId, providerId: "fixture", modelId: "fixture", budget: { maxTurns: 2, maxModelCalls: 2, maxToolCalls: 1, maxOutputTokens: 64, maxTotalTokens: 256, maxDurationMs: 30_000 } });
    f.conversations.appendExecutionMessage({ runId: adopted.runId, role: "assistant", content: { type: "assistant", text: "recovered reply", reasoningSummary: null, toolCalls: [] } });
    f.conversations.completeExecution(adopted.runId, usage(), "stop", "recovered reply");
    const first = f.service.recoverRunOutputs();
    const second = f.service.recoverRunOutputs();
    assert.deepEqual({ projected: first.projected, replayed: first.replayed, deliveries: first.deliveries.length }, { projected: 1, replayed: 0, deliveries: 1 });
    assert.deepEqual({ projected: second.projected, replayed: second.replayed, deliveries: second.deliveries.length }, { projected: 0, replayed: 1, deliveries: 1 });
    assert.equal(f.service.listDeliveries({ connectorId: "mattermost" }).length, 1);
  } finally { await f.cleanup(); }
});

test("STEP022C non-Connector, non-terminal, and empty-output Runs are not projected", async () => {
  const f = await fixture();
  try {
    const conversation = f.conversations.create({ workspaceId: "alpha" });
    const sent = f.conversations.send({ workspaceId: "alpha", conversationId: conversation.conversationId, submissionKey: "local", text: "hello" });
    assert.equal(f.service.projectRunOutput(sent.run.runId).kind, "not-connector-run");
  } finally { await f.cleanup(); }
});
