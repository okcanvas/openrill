import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { TaskService } from "../../packages/tasks/dist/index.js";
import { TaskFlowControllerRuntimeFactory, TaskFlowError, TaskFlowService } from "../../packages/task-flows/dist/index.js";

async function fixture(name) {
  const root = await mkdtemp(join(tmpdir(), `openrill-step020c-${name}-`));
  const paths = resolveProfilePaths({ profile: name, env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  let clock = 9000;
  const now = () => ++clock;
  let id = 0;
  const state = await openOpenRillStateDatabase({ profilePaths: paths, now });
  const conversations = new ConversationService({ state, workspaceIds: ["alpha"], createId: () => `${name}-${++id}`, now });
  const tasks = new TaskService(state, ["alpha"]);
  const flows = new TaskFlowService(state, tasks, ["alpha"], now);
  const ownerKey = conversations.create({ workspaceId: "alpha", title: "Controller owner" }).conversationId;
  const scheduled = [];
  const factory = new TaskFlowControllerRuntimeFactory({
    state, conversations, tasks, taskFlows: flows, now,
    scheduleRun: (runId) => { scheduled.push(runId); return true; },
    cancelTask: (task) => tasks.cancel({ workspaceId: task.workspaceId, taskId: task.taskId }, (current) => {
      conversations.cancel({ workspaceId: current.workspaceId, conversationId: current.conversationId, runId: current.runId });
    }),
  });
  const runtime = factory.bind({ workspaceId: "alpha", ownerKey, controllerId: "tests/controller" });
  return { root, paths, state, conversations, tasks, flows, ownerKey, scheduled, runtime, now, cleanup: async () => { if (state.isOpen()) state.close(); await rm(root, { recursive: true, force: true }); } };
}

test("STEP020C bound runtime creates a deterministic managed Flow and replays after mutable state changes", async () => {
  const f = await fixture("create");
  try {
    const first = f.runtime.createManaged({ requestKey: "flow-one", goal: "Execute two durable child tasks", currentStep: "prepare", state: { count: 0 } });
    assert.equal(first.replayed, false);
    assert.match(first.flow.flowId, /^flow:[0-9a-f]{64}$/);
    const waiting = f.runtime.setWaiting({ flowId: first.flow.flowId, expectedRevision: first.flow.revision, currentStep: "review", wait: { kind: "operator" } });
    assert.equal(waiting.status, "WAITING");
    const replay = f.runtime.createManaged({ requestKey: "flow-one", goal: "Execute two durable child tasks", currentStep: "prepare", state: { count: 0 } });
    assert.equal(replay.replayed, true);
    assert.equal(replay.flow.flowId, first.flow.flowId);
    assert.equal(replay.flow.status, "WAITING");
    assert.throws(
      () => f.runtime.createManaged({ requestKey: "flow-one", goal: "different goal", currentStep: "prepare", state: { count: 0 } }),
      (error) => error instanceof TaskFlowError && error.code === "TASK_FLOW_REQUEST_CONFLICT",
    );
    const other = new TaskFlowControllerRuntimeFactory({
      state: f.state, conversations: f.conversations, tasks: f.tasks, taskFlows: f.flows,
      scheduleRun: () => true, now: f.now,
    }).bind({ workspaceId: "alpha", ownerKey: f.ownerKey, controllerId: "tests/other" });
    assert.throws(() => other.get(first.flow.flowId), (error) => error instanceof TaskFlowError && error.code === "TASK_FLOW_ACCESS_DENIED");
  } finally { await f.cleanup(); }
});

test("STEP020C runTask atomically creates Run, Task, classification, Flow link, and exact replay", async () => {
  const f = await fixture("admit");
  try {
    const created = f.runtime.createManaged({ requestKey: "flow", goal: "Admit child", currentStep: "one" });
    const first = f.runtime.runTask({ flowId: created.flow.flowId, expectedRevision: created.flow.revision, requestKey: "child-one", stepKey: "one", text: "perform the first durable child task" });
    assert.equal(first.replayed, false);
    assert.equal(first.scheduled, true);
    assert.deepEqual(f.scheduled, [first.run.runId]);
    assert.equal(first.task.runId, first.run.runId);
    assert.equal(first.task.conversationId, f.ownerKey);
    assert.equal(first.task.runtime, "CONVERSATION");
    assert.equal(first.task.taskKind, "task_flow.child");
    assert.equal(first.task.sourceId, created.flow.flowId);
    assert.equal(first.flow.flow.status, "RUNNING");
    assert.equal(first.flow.flow.currentStep, "one");
    assert.equal(first.flow.tasks.length, 1);
    assert.equal(first.flow.tasks[0].taskId, first.task.taskId);
    assert.ok(first.flow.events.some((event) => event.eventType === "taskFlow.task.admitted"));

    const replay = f.runtime.runTask({ flowId: created.flow.flowId, expectedRevision: 1, requestKey: "child-one", stepKey: "one", text: "perform the first durable child task" });
    assert.equal(replay.replayed, true);
    assert.equal(replay.run.runId, first.run.runId);
    assert.equal(replay.task.taskId, first.task.taskId);
    assert.equal(replay.flow.flow.revision, first.flow.flow.revision);
    assert.deepEqual(f.scheduled, [first.run.runId, first.run.runId]);
    f.conversations.transitionRun({ runId: first.run.runId, status: "RUNNING" });
    f.conversations.transitionRun({ runId: first.run.runId, status: "COMPLETED" });
    const terminalReplay = f.runtime.runTask({ flowId: created.flow.flowId, expectedRevision: 1, requestKey: "child-one", stepKey: "one", text: "perform the first durable child task" });
    assert.equal(terminalReplay.replayed, true);
    assert.equal(terminalReplay.run.status, "COMPLETED");
    assert.equal(terminalReplay.scheduled, false);
    assert.deepEqual(f.scheduled, [first.run.runId, first.run.runId]);
    assert.throws(
      () => f.runtime.runTask({ flowId: created.flow.flowId, expectedRevision: replay.flow.flow.revision, requestKey: "child-one", stepKey: "one", text: "different child task" }),
      (error) => error?.code === "SUBMISSION_CONFLICT",
    );
  } finally { await f.cleanup(); }
});

test("STEP020C admission fails before writes for WAITING, cancellation, stale revision, and controller mismatch", async () => {
  const f = await fixture("guards");
  try {
    const created = f.runtime.createManaged({ requestKey: "flow", goal: "Guard admission" });
    const waiting = f.runtime.setWaiting({ flowId: created.flow.flowId, expectedRevision: created.flow.revision, wait: { kind: "external" } });
    const before = f.conversations.get({ workspaceId: "alpha", conversationId: f.ownerKey });
    assert.throws(
      () => f.runtime.runTask({ flowId: created.flow.flowId, expectedRevision: waiting.revision, requestKey: "waiting", stepKey: "one", text: "must not be admitted" }),
      (error) => error instanceof TaskFlowError && error.code === "TASK_FLOW_STATE_INVALID",
    );
    const resumed = f.runtime.resume({ flowId: created.flow.flowId, expectedRevision: waiting.revision, status: "RUNNING" });
    assert.throws(
      () => f.runtime.runTask({ flowId: created.flow.flowId, expectedRevision: resumed.revision - 1, requestKey: "stale", stepKey: "one", text: "must not be admitted" }),
      (error) => error instanceof TaskFlowError && error.code === "TASK_FLOW_REVISION_CONFLICT",
    );
    const cancelling = f.runtime.requestCancel({ flowId: created.flow.flowId, expectedRevision: resumed.revision });
    assert.throws(
      () => f.runtime.runTask({ flowId: created.flow.flowId, expectedRevision: cancelling.revision, requestKey: "cancelled", stepKey: "one", text: "must not be admitted" }),
      (error) => error instanceof TaskFlowError && error.code === "TASK_FLOW_STATE_INVALID" && /cancellation/.test(error.message),
    );
    const after = f.conversations.get({ workspaceId: "alpha", conversationId: f.ownerKey });
    assert.equal(after.messages.length, before.messages.length);
    assert.equal(after.runs.length, before.runs.length);
  } finally { await f.cleanup(); }
});

test("STEP020C a post-Run admission failure rolls back message, Run, Task, and submission together", async () => {
  const f = await fixture("rollback");
  try {
    const created = f.runtime.createManaged({ requestKey: "flow", goal: "Rollback child admission" });
    const external = new DatabaseSync(f.state.diagnostics().databasePath);
    try {
      external.exec(`CREATE TRIGGER reject_step020c_link BEFORE INSERT ON task_flow_tasks BEGIN SELECT RAISE(ABORT, 'reject step020c link'); END;`);
    } finally { external.close(); }
    const before = f.conversations.get({ workspaceId: "alpha", conversationId: f.ownerKey });
    assert.throws(() => f.runtime.runTask({ flowId: created.flow.flowId, expectedRevision: created.flow.revision, requestKey: "rollback", stepKey: "one", text: "this transaction must roll back" }), /reject step020c link/);
    const after = f.conversations.get({ workspaceId: "alpha", conversationId: f.ownerKey });
    assert.equal(after.messages.length, before.messages.length);
    assert.equal(after.runs.length, before.runs.length);
    assert.equal(f.tasks.list({ workspaceId: "alpha" }).length, 0);
    assert.equal(f.runtime.get(created.flow.flowId).tasks.length, 0);
    const external2 = new DatabaseSync(f.state.diagnostics().databasePath);
    try { external2.exec("DROP TRIGGER reject_step020c_link"); } finally { external2.close(); }
  } finally { await f.cleanup(); }
});

test("STEP020C runtime rebind after restart preserves Flow and child identity", async () => {
  const f = await fixture("restart");
  try {
    const created = f.runtime.createManaged({ requestKey: "flow", goal: "Restart stable runtime" });
    const child = f.runtime.runTask({ flowId: created.flow.flowId, expectedRevision: created.flow.revision, requestKey: "child", stepKey: "one", text: "restart-safe child" });
    f.state.close();
    const state2 = await openOpenRillStateDatabase({ profilePaths: f.paths, now: f.now });
    try {
      const conversations2 = new ConversationService({ state: state2, workspaceIds: ["alpha"], now: f.now });
      const tasks2 = new TaskService(state2, ["alpha"]);
      const flows2 = new TaskFlowService(state2, tasks2, ["alpha"], f.now);
      const scheduled2 = [];
      const runtime2 = new TaskFlowControllerRuntimeFactory({ state: state2, conversations: conversations2, tasks: tasks2, taskFlows: flows2, now: f.now, scheduleRun: (runId) => { scheduled2.push(runId); return true; } })
        .bind({ workspaceId: "alpha", ownerKey: f.ownerKey, controllerId: "tests/controller" });
      const view = runtime2.get(created.flow.flowId);
      assert.equal(view.tasks[0].taskId, child.task.taskId);
      const replay = runtime2.runTask({ flowId: created.flow.flowId, expectedRevision: 1, requestKey: "child", stepKey: "one", text: "restart-safe child" });
      assert.equal(replay.replayed, true);
      assert.equal(replay.run.runId, child.run.runId);
      assert.deepEqual(scheduled2, [child.run.runId]);
    } finally { state2.close(); }
  } finally { await f.cleanup(); }
});
