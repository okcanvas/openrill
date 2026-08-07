import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { TaskService } from "../../packages/tasks/dist/index.js";
import { TaskFlowMaintenanceService, TaskFlowService } from "../../packages/task-flows/dist/index.js";

async function fixture(name) {
  const root = await mkdtemp(join(tmpdir(), `openrill-step020d-flow-${name}-`));
  const paths = resolveProfilePaths({ profile: `step020d-flow-${name}`, env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  let clock = 1_000;
  let id = 0;
  const now = () => clock;
  const state = await openOpenRillStateDatabase({ profilePaths: paths, now });
  const conversations = new ConversationService({ state, workspaceIds: ["alpha"], now, createId: () => `flow-${++id}` });
  const tasks = new TaskService(state, ["alpha"]);
  const flows = new TaskFlowService(state, tasks, ["alpha"], now);
  const conversation = conversations.create({ workspaceId: "alpha", title: name });
  const createTask = (key) => {
    const sent = conversations.send({ workspaceId: "alpha", conversationId: conversation.conversationId, submissionKey: key, text: key });
    return { sent, task: tasks.getByRun({ workspaceId: "alpha", runId: sent.run.runId }) };
  };
  const createFlow = (key, status = "RUNNING") => flows.create({ workspaceId: "alpha", ownerKey: conversation.conversationId, controllerId: `controller/${name}`, goal: key, currentStep: key, status });
  const cancelFlow = (input) => flows.cancel(input, (task) => tasks.cancel({ workspaceId: task.workspaceId, taskId: task.taskId }, (current) => conversations.cancel({ workspaceId: current.workspaceId, conversationId: current.conversationId, runId: current.runId })));
  return {
    root, state, conversations, tasks, flows, conversation, createTask, createFlow, cancelFlow, now,
    advance(value) { clock += value; },
    setNow(value) { clock = value; },
    cleanup: async () => { state.close(); await rm(root, { recursive: true, force: true }); },
  };
}

function maintenance(f) {
  return new TaskFlowMaintenanceService({ state: f.state, workspaceIds: ["alpha"], now: f.now, cancelFlow: f.cancelFlow });
}

test("STEP020D Flow reconciliation replays stuck cancellation, closes child Tasks and schedules retention idempotently", async () => {
  const f = await fixture("cancel-stuck");
  try {
    const task = f.createTask("child");
    let flow = f.createFlow("cancel-stuck");
    flow = f.flows.linkTask({ workspaceId: "alpha", ownerKey: f.conversation.conversationId, flowId: flow.flowId, taskId: task.task.taskId, expectedRevision: flow.revision, stepKey: "child" }).flow;
    flow = f.flows.requestCancel({ workspaceId: "alpha", ownerKey: f.conversation.conversationId, flowId: flow.flowId, expectedRevision: flow.revision });
    f.advance(5 * 60_000 + 1);
    const service = maintenance(f);
    const audit = service.audit({ workspaceId: "alpha", ownerKey: f.conversation.conversationId });
    assert.ok(audit.findings.some((finding) => finding.code === "FLOW_CANCEL_STUCK" && finding.repairPolicy === "SAFE_REPAIR"));
    const preview = service.reconcile({ workspaceId: "alpha", ownerKey: f.conversation.conversationId, mode: "PREVIEW" });
    assert.ok(preview.decisions.some((decision) => decision.action === "REPLAY_CANCELLATION" && decision.applied === false));
    const applied = service.reconcile({ workspaceId: "alpha", ownerKey: f.conversation.conversationId, mode: "APPLY" });
    assert.equal(applied.cancellationReplayed, 1);
    assert.equal(applied.cancelled, 1);
    assert.equal(applied.retentionScheduled, 1);
    const view = f.flows.get({ workspaceId: "alpha", ownerKey: f.conversation.conversationId, flowId: flow.flowId });
    assert.equal(view.flow.status, "CANCELLED");
    assert.equal(view.tasks[0].task.status, "CANCELLED");
    assert.ok(view.flow.cleanupAfter > view.flow.endedAt);
    assert.equal(service.reconcile({ workspaceId: "alpha", ownerKey: f.conversation.conversationId, mode: "APPLY" }).decisions.length, 0);
  } finally { await f.cleanup(); }
});

test("STEP020D cancel-requested Flow with terminal children finalizes safely while normal all-terminal Flow remains controller-owned", async () => {
  const f = await fixture("finalize");
  try {
    const cancelledTask = f.createTask("cancelled-child");
    f.conversations.transitionRun({ runId: cancelledTask.sent.run.runId, status: "RUNNING" });
    f.conversations.transitionRun({ runId: cancelledTask.sent.run.runId, status: "COMPLETED" });
    let cancellable = f.createFlow("cancellable");
    cancellable = f.flows.linkTask({ workspaceId: "alpha", ownerKey: f.conversation.conversationId, flowId: cancellable.flowId, taskId: cancelledTask.task.taskId, expectedRevision: cancellable.revision }).flow;
    cancellable = f.flows.requestCancel({ workspaceId: "alpha", ownerKey: f.conversation.conversationId, flowId: cancellable.flowId, expectedRevision: cancellable.revision });

    const controllerTask = f.createTask("controller-owned-child");
    f.conversations.transitionRun({ runId: controllerTask.sent.run.runId, status: "RUNNING" });
    f.conversations.transitionRun({ runId: controllerTask.sent.run.runId, status: "COMPLETED" });
    let controllerOwned = f.createFlow("controller-owned");
    controllerOwned = f.flows.linkTask({ workspaceId: "alpha", ownerKey: f.conversation.conversationId, flowId: controllerOwned.flowId, taskId: controllerTask.task.taskId, expectedRevision: controllerOwned.revision }).flow;

    const service = maintenance(f);
    const audit = service.audit({ workspaceId: "alpha", ownerKey: f.conversation.conversationId });
    assert.ok(audit.findings.some((finding) => finding.flowId === cancellable.flowId && finding.code === "FLOW_CANCEL_FINALIZATION_PENDING"));
    assert.ok(audit.findings.some((finding) => finding.flowId === controllerOwned.flowId && finding.code === "FLOW_ALL_CHILDREN_TERMINAL_ACTIVE" && finding.repairPolicy === "REPORT_ONLY"));
    const applied = service.reconcile({ workspaceId: "alpha", ownerKey: f.conversation.conversationId, mode: "APPLY" });
    assert.equal(applied.cancelled, 1);
    assert.equal(f.flows.get({ workspaceId: "alpha", ownerKey: f.conversation.conversationId, flowId: cancellable.flowId }).flow.status, "CANCELLED");
    assert.equal(f.flows.get({ workspaceId: "alpha", ownerKey: f.conversation.conversationId, flowId: controllerOwned.flowId }).flow.status, "RUNNING");
  } finally { await f.cleanup(); }
});

test("STEP020D terminal Flow with active child stays report-only and outside retention candidates", async () => {
  const f = await fixture("retention-safety");
  try {
    const task = f.createTask("active-child");
    let flow = f.createFlow("terminal-active");
    flow = f.flows.linkTask({ workspaceId: "alpha", ownerKey: f.conversation.conversationId, flowId: flow.flowId, taskId: task.task.taskId, expectedRevision: flow.revision }).flow;
    flow = f.flows.finish({ workspaceId: "alpha", ownerKey: f.conversation.conversationId, flowId: flow.flowId, expectedRevision: flow.revision });
    const service = maintenance(f);
    const audit = service.audit({ workspaceId: "alpha", ownerKey: f.conversation.conversationId });
    assert.ok(audit.findings.some((finding) => finding.code === "FLOW_TERMINAL_WITH_ACTIVE_TASK" && finding.repairPolicy === "REPORT_ONLY"));
    assert.equal(audit.findings.some((finding) => finding.code === "FLOW_MISSING_CLEANUP"), false);
    const applied = service.reconcile({ workspaceId: "alpha", ownerKey: f.conversation.conversationId, mode: "APPLY" });
    assert.equal(applied.retentionScheduled, 0);
    const view = f.flows.get({ workspaceId: "alpha", ownerKey: f.conversation.conversationId, flowId: flow.flowId });
    assert.equal(view.flow.cleanupAfter, null);
    const retention = service.retentionPreview({ workspaceId: "alpha", ownerKey: f.conversation.conversationId });
    assert.equal(retention.candidates.length, 0);
    assert.ok(retention.protectedActive >= 1);
  } finally { await f.cleanup(); }
});
