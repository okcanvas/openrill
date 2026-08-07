import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase, resolveRequiredTaskCompletion } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { TaskService } from "../../packages/tasks/dist/index.js";
import {
  TaskCompletionDeliveryService,
  TaskFlowControllerRuntimeFactory,
  TaskFlowService,
} from "../../packages/task-flows/dist/index.js";

async function fixture(name) {
  const root = await mkdtemp(join(tmpdir(), `openrill-step020e-${name}-`));
  const paths = resolveProfilePaths({ profile: `step020e-${name}`, env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  let clock = 20_000;
  let id = 0;
  const now = () => ++clock;
  const state = await openOpenRillStateDatabase({ profilePaths: paths, now });
  const conversations = new ConversationService({ state, workspaceIds: ["alpha"], createId: () => `${name}-${++id}`, now });
  const tasks = new TaskService(state, ["alpha"]);
  const flows = new TaskFlowService(state, tasks, ["alpha"], now);
  const ownerKey = conversations.create({ workspaceId: "alpha", title: "Completion owner" }).conversationId;
  const scheduledChildren = [];
  const runtimeFactory = new TaskFlowControllerRuntimeFactory({
    state, conversations, tasks, taskFlows: flows, now,
    scheduleRun: (runId) => { scheduledChildren.push(runId); return true; },
  });
  const runtime = runtimeFactory.bind({ workspaceId: "alpha", ownerKey, controllerId: "tests/controller" });
  const flow = runtime.createManaged({ requestKey: "flow", goal: "Deliver child completion", currentStep: "child" }).flow;
  const child = runtime.runTask({ flowId: flow.flowId, expectedRevision: flow.revision, requestKey: "child", stepKey: "child", text: "produce a durable final result" });
  const scheduledWakes = [];
  const deliveries = new TaskCompletionDeliveryService({
    state, conversations, runtimes: runtimeFactory, now,
    scheduleRun: (runId) => { scheduledWakes.push(runId); return true; },
  });
  return {
    root, paths, state, conversations, tasks, flows, ownerKey, runtimeFactory, runtime,
    flowId: flow.flowId, child, deliveries, scheduledChildren, scheduledWakes, now,
    cleanup: async () => { if (state.isOpen()) state.close(); await rm(root, { recursive: true, force: true }); },
  };
}

function completeChild(f, text) {
  f.conversations.transitionRun({ runId: f.child.run.runId, status: "RUNNING" });
  f.conversations.transitionRun({ runId: f.child.run.runId, status: "COMPLETED", taskCompletionText: text });
  return f.tasks.getByRun({ workspaceId: "alpha", runId: f.child.run.runId });
}

function deliverySnapshot(f) {
  return f.state.transaction((repositories) => {
    const task = repositories.tasks.getByRun(f.child.run.runId);
    assert.ok(task);
    return {
      task,
      deliveries: repositories.taskDeliveries.listForTask(task.taskId, 100),
      taskEvents: repositories.tasks.listEvents(task.taskId, 100),
    };
  });
}

function recordDecision(f, wakeRunId, name = "task_flow.finish") {
  const execution = f.conversations.executionContext(wakeRunId);
  f.conversations.appendEvent({
    runId: wakeRunId,
    attemptId: execution.attempt.attemptId,
    eventType: "tool.completed",
    payload: { toolCallId: `decision-${wakeRunId}`, name, isError: false, errorCode: null },
    idempotencyKey: `decision:${wakeRunId}`,
  });
}

test("STEP020E required completion distinguishes concrete deliverables from empty and progress-only output", () => {
  assert.equal(resolveRequiredTaskCompletion("Final report: all checks passed.").terminalOutcome, "SUCCEEDED");
  assert.equal(resolveRequiredTaskCompletion("").terminalOutcome, "BLOCKED");
  assert.equal(resolveRequiredTaskCompletion("확인해 보겠습니다.").terminalOutcome, "BLOCKED");
  assert.equal(resolveRequiredTaskCompletion("I will now analyze the logs.").terminalOutcome, "BLOCKED");
});

test("STEP020E child terminal transition atomically records semantic outcome and durable delivery intent", async () => {
  const f = await fixture("atomic");
  try {
    const task = completeChild(f, "Final artifact: durable completion evidence.");
    assert.equal(task.status, "SUCCEEDED");
    assert.equal(task.notifyPolicy, "DONE_ONLY");
    assert.equal(task.deliveryStatus, "PENDING");
    assert.equal(task.terminalOutcome, "SUCCEEDED");
    const snapshot = deliverySnapshot(f);
    assert.equal(snapshot.deliveries.length, 1);
    assert.equal(snapshot.deliveries[0].deliveryStatus, "PENDING");
    assert.equal(snapshot.deliveries[0].terminalOutcome, "SUCCEEDED");
    assert.equal(snapshot.deliveries[0].flowId, f.flowId);
    assert.ok(snapshot.taskEvents.some((event) => event.eventType === "task.succeeded"));
  } finally { await f.cleanup(); }
});

test("STEP020E a delivery-ledger insertion failure rolls back Run and Task terminal state together", async () => {
  const f = await fixture("rollback");
  try {
    f.conversations.transitionRun({ runId: f.child.run.runId, status: "RUNNING" });
    const external = new DatabaseSync(f.state.diagnostics().databasePath);
    try {
      external.exec("CREATE TRIGGER reject_step020e_delivery BEFORE INSERT ON task_completion_deliveries BEGIN SELECT RAISE(ABORT, 'reject completion delivery'); END;");
    } finally { external.close(); }
    assert.throws(
      () => f.conversations.transitionRun({ runId: f.child.run.runId, status: "COMPLETED", taskCompletionText: "Final result" }),
      /reject completion delivery/,
    );
    const snapshot = f.state.transaction((repositories) => ({
      run: repositories.conversations.getRun(f.child.run.runId),
      task: repositories.tasks.getByRun(f.child.run.runId),
    }));
    assert.equal(snapshot.run.status, "RUNNING");
    assert.equal(snapshot.task.status, "RUNNING");
    assert.equal(snapshot.task.deliveryStatus, "NOT_APPLICABLE");
    assert.equal(f.state.transaction((repositories) => repositories.taskDeliveries.listForTask(snapshot.task.taskId, 100).length), 0);
  } finally { await f.cleanup(); }
});

test("STEP020E queues one durable system message and wake Run, survives reopen, and delivers only after a controller decision", async () => {
  const f = await fixture("restart");
  try {
    completeChild(f, "Final child output for the controller.");
    const delivery = deliverySnapshot(f).deliveries[0];
    const first = f.deliveries.dispatch(delivery.deliveryId);
    assert.equal(first.delivery.deliveryStatus, "SESSION_QUEUED");
    assert.equal(first.scheduled, true);
    assert.ok(first.delivery.systemMessageId);
    assert.ok(first.delivery.wakeRunId);
    const firstWakeRunId = first.delivery.wakeRunId;
    const owner = f.conversations.get({ workspaceId: "alpha", conversationId: f.ownerKey });
    assert.equal(owner.messages.filter((message) => message.role === "system").length, 1);
    const wakeTask = f.tasks.getByRun({ workspaceId: "alpha", runId: firstWakeRunId });
    assert.equal(wakeTask.taskKind, "task_flow.controller_wake");
    assert.equal(wakeTask.notifyPolicy, "SILENT");

    const replay = f.deliveries.dispatch(delivery.deliveryId);
    assert.equal(replay.delivery.wakeRunId, firstWakeRunId);
    assert.equal(f.conversations.get({ workspaceId: "alpha", conversationId: f.ownerKey }).messages.filter((message) => message.role === "system").length, 1);

    f.state.close();
    const state2 = await openOpenRillStateDatabase({ profilePaths: f.paths, now: f.now });
    try {
      const conversations2 = new ConversationService({ state: state2, workspaceIds: ["alpha"], now: f.now });
      const tasks2 = new TaskService(state2, ["alpha"]);
      const flows2 = new TaskFlowService(state2, tasks2, ["alpha"], f.now);
      const factory2 = new TaskFlowControllerRuntimeFactory({ state: state2, conversations: conversations2, tasks: tasks2, taskFlows: flows2, now: f.now, scheduleRun: () => true });
      const scheduled2 = [];
      const service2 = new TaskCompletionDeliveryService({ state: state2, conversations: conversations2, runtimes: factory2, now: f.now, scheduleRun: (runId) => { scheduled2.push(runId); return true; } });
      const drained = service2.drain();
      assert.equal(drained.scanned, 1);
      assert.deepEqual(scheduled2, [firstWakeRunId]);
      const execution = conversations2.executionContext(firstWakeRunId);
      conversations2.appendEvent({ runId: firstWakeRunId, attemptId: execution.attempt.attemptId, eventType: "tool.completed", payload: { toolCallId: "finish", name: "task_flow.finish", isError: false }, idempotencyKey: "decision:finish" });
      conversations2.transitionRun({ runId: firstWakeRunId, status: "RUNNING" });
      conversations2.transitionRun({ runId: firstWakeRunId, status: "COMPLETED", taskCompletionText: "Flow finished." });
      const completed = service2.completeWakeRun(firstWakeRunId);
      assert.equal(completed.deliveryStatus, "DELIVERED");
      assert.equal(service2.dispatch(delivery.deliveryId).delivery.deliveryStatus, "DELIVERED");
    } finally { state2.close(); }
  } finally { await f.cleanup(); }
});

test("STEP020E wake completion without a successful controller decision fails delivery and retries with a new wake Run", async () => {
  const f = await fixture("decision-required");
  try {
    completeChild(f, "Concrete child result.");
    const delivery = deliverySnapshot(f).deliveries[0];
    const first = f.deliveries.dispatch(delivery.deliveryId);
    const firstWake = first.delivery.wakeRunId;
    f.conversations.transitionRun({ runId: firstWake, status: "RUNNING" });
    f.conversations.transitionRun({ runId: firstWake, status: "COMPLETED", taskCompletionText: "I reviewed it." });
    const failed = f.deliveries.completeWakeRun(firstWake);
    assert.equal(failed.deliveryStatus, "FAILED");
    assert.match(failed.lastError, /CONTROLLER_DECISION_REQUIRED/);

    const retry = f.deliveries.dispatch(delivery.deliveryId);
    assert.equal(retry.delivery.deliveryStatus, "SESSION_QUEUED");
    assert.notEqual(retry.delivery.wakeRunId, firstWake);
    assert.equal(retry.delivery.attemptCount, 2);
    recordDecision(f, retry.delivery.wakeRunId, "task_flow.wait");
    f.conversations.transitionRun({ runId: retry.delivery.wakeRunId, status: "RUNNING" });
    f.conversations.transitionRun({ runId: retry.delivery.wakeRunId, status: "COMPLETED", taskCompletionText: "Waiting was persisted." });
    assert.equal(f.deliveries.completeWakeRun(retry.delivery.wakeRunId).deliveryStatus, "DELIVERED");
  } finally { await f.cleanup(); }
});

test("STEP020E suppresses controller wake when the owning Flow is already cancelling or terminal", async () => {
  const f = await fixture("suppress");
  try {
    completeChild(f, "Final result before operator cancellation.");
    const view = f.runtime.get(f.flowId);
    f.runtime.requestCancel({ flowId: f.flowId, expectedRevision: view.flow.revision });
    const delivery = deliverySnapshot(f).deliveries[0];
    const suppressed = f.deliveries.dispatch(delivery.deliveryId);
    assert.equal(suppressed.delivery.deliveryStatus, "NOT_APPLICABLE");
    assert.equal(suppressed.scheduled, false);
    assert.equal(suppressed.delivery.wakeRunId, null);
  } finally { await f.cleanup(); }
});
