import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { TaskService } from "../../packages/tasks/dist/index.js";
import { TaskFlowService } from "../../packages/task-flows/dist/index.js";
import { LocalCliProtocolClient } from "../../apps/agent-cli/dist/local-protocol-client.js";
import { readHostMetadata, startLocalHost } from "../../services/agent-host/dist/index.js";

function overwriteTask(state, taskId, patch) {
  state.transaction((repositories) => {
    const current = repositories.tasks.get(taskId);
    assert.ok(current);
    const updated = repositories.tasks.update({
      taskId: current.taskId,
      expectedRevision: current.revision,
      parentTaskId: current.parentTaskId,
      runtime: current.runtime,
      taskKind: current.taskKind,
      sourceId: current.sourceId,
      status: patch.status,
      recoveryState: current.recoveryState,
      progressSummary: patch.progressSummary,
      terminalSummary: patch.terminalSummary,
      errorCode: null,
      startedAt: current.startedAt,
      endedAt: patch.endedAt,
      updatedAt: patch.updatedAt,
      cleanupAfter: null,
    });
    assert.ok(updated);
  });
}

async function connect(host) {
  const metadata = await readHostMetadata(host.paths);
  assert.ok(metadata);
  const client = new LocalCliProtocolClient(metadata, "step020d-maintenance-host", process.platform);
  await client.connect();
  return client;
}

test("STEP020D Host-start reconciliation repairs Task projection and finalizes pending Flow cancellation without scheduling retention", async () => {
  const root = await mkdtemp(join(tmpdir(), "openrill-step020d-host-"));
  const profile = "step020d-maintenance-host";
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config"), NO_COLOR: "1" };
  const paths = resolveProfilePaths({ profile, env, platform: process.platform });
  let clock = 10_000;
  const now = () => clock;
  let state = await openOpenRillStateDatabase({ profilePaths: paths, now });
  let host = null;
  let client = null;
  try {
    let id = 0;
    const conversations = new ConversationService({ state, workspaceIds: ["default"], now, createId: () => `host-${++id}` });
    const tasks = new TaskService(state, ["default"]);
    const flows = new TaskFlowService(state, tasks, ["default"], now);
    const conversation = conversations.create({ workspaceId: "default", title: "Host maintenance" });
    const sent = conversations.send({ workspaceId: "default", conversationId: conversation.conversationId, submissionKey: "host-maintenance", text: "completed child" });
    conversations.transitionRun({ runId: sent.run.runId, status: "RUNNING" });
    conversations.transitionRun({ runId: sent.run.runId, status: "COMPLETED" });
    const task = tasks.getByRun({ workspaceId: "default", runId: sent.run.runId });
    overwriteTask(state, task.taskId, { status: "RUNNING", progressSummary: "fixture drift", terminalSummary: null, endedAt: null, updatedAt: now() });
    let flow = flows.create({ workspaceId: "default", ownerKey: conversation.conversationId, controllerId: "tests/step020d-host", goal: "Finalize cancellation", status: "RUNNING" });
    flow = flows.linkTask({ workspaceId: "default", ownerKey: conversation.conversationId, flowId: flow.flowId, taskId: task.taskId, expectedRevision: flow.revision }).flow;
    flow = flows.requestCancel({ workspaceId: "default", ownerKey: conversation.conversationId, flowId: flow.flowId, expectedRevision: flow.revision });
    state.close();
    state = null;

    host = await startLocalHost({ profile, env, port: 0, workspaceIds: ["default"], now, maintenanceAutoArm: false });
    await host.ready;
    client = await connect(host);
    const repairedTask = await client.call("task.get", { workspaceId: "default", taskId: task.taskId }, 5_000);
    assert.equal(repairedTask.task.status, "SUCCEEDED");
    assert.equal(repairedTask.task.cleanupAfter, null, "Host-start reconciliation must not mutate retention revision/evidence");
    const repairedFlow = await client.call("taskFlow.get", { workspaceId: "default", ownerKey: conversation.conversationId, flowId: flow.flowId }, 5_000);
    assert.equal(repairedFlow.flow.status, "CANCELLED");
    assert.equal(repairedFlow.flow.cleanupAfter, null, "Host-start cancellation repair must keep retention scheduling explicit");

    const taskApply = await client.call("task.reconcile", { workspaceId: "default", mode: "APPLY" }, 5_000);
    assert.equal(taskApply.retentionScheduled, 1);
    const flowApply = await client.call("taskFlow.reconcile", { workspaceId: "default", ownerKey: conversation.conversationId, mode: "APPLY" }, 5_000);
    assert.equal(flowApply.retentionScheduled, 1);
    const taskRetention = await client.call("task.retention.preview", { workspaceId: "default" }, 5_000);
    const flowRetention = await client.call("taskFlow.retention.preview", { workspaceId: "default", ownerKey: conversation.conversationId }, 5_000);
    assert.equal(taskRetention.candidates.length, 0, "retention windows are scheduled but not expired");
    assert.equal(flowRetention.candidates.length, 0, "retention windows are scheduled but not expired");
    const taskAudit = await client.call("task.audit", { workspaceId: "default" }, 5_000);
    const flowAudit = await client.call("taskFlow.audit", { workspaceId: "default", ownerKey: conversation.conversationId }, 5_000);
    assert.equal(taskAudit.summary.errors, 0);
    assert.equal(flowAudit.summary.errors, 0);
  } finally {
    client?.close();
    await host?.close("step020d-host-cleanup");
    state?.close();
    await rm(root, { recursive: true, force: true });
  }
});
