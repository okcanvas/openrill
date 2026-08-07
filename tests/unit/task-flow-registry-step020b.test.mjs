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
import { TaskFlowError, TaskFlowService } from "../../packages/task-flows/dist/index.js";

async function fixture(name) {
  const root = await mkdtemp(join(tmpdir(), `openrill-step020b-${name}-`));
  const paths = resolveProfilePaths({ profile: name, env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  let clock = 1000;
  const now = () => ++clock;
  const state = await openOpenRillStateDatabase({ profilePaths: paths, now });
  let id = 0;
  const conversations = new ConversationService({ state, workspaceIds: ["alpha"], createId: () => `${name}-${++id}`, now });
  const tasks = new TaskService(state, ["alpha"]);
  const flows = new TaskFlowService(state, tasks, ["alpha"], now);
  return { root, paths, state, conversations, tasks, flows, now, cleanup: async () => { if (state.isOpen()) state.close(); await rm(root, { recursive: true, force: true }); } };
}

function send(f, key, text, conversationId = null) {
  const ownerKey = conversationId ?? f.conversations.create({ workspaceId: "alpha" }).conversationId;
  return f.conversations.send({ workspaceId: "alpha", conversationId: ownerKey, submissionKey: key, text });
}

function scope(ownerKey, flowId) {
  return { workspaceId: "alpha", ownerKey, flowId };
}

test("STEP020B durable Task Flow tables remain present after the owner-scope correction", async () => {
  const f = await fixture("schema");
  try {
    assert.ok(f.state.schemaVersion >= 19);
    const db = new DatabaseSync(f.state.diagnostics().databasePath, { readOnly: true });
    try {
      for (const table of ["task_flows", "task_flow_events", "task_flow_tasks"]) {
        assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name=?").get(table)?.name, table);
      }
    } finally { db.close(); }
  } finally { await f.cleanup(); }
});

test("STEP020B managed Task Flow uses revision-CAS across waiting, blocked, resume, and success", async () => {
  const f = await fixture("lifecycle");
  try {
    const run = send(f, "one", "first child");
    const ownerKey = run.conversation.conversationId;
    const task = f.tasks.getByRun({ workspaceId: "alpha", runId: run.run.runId });
    let flow = f.flows.create({ workspaceId: "alpha", ownerKey, controllerId: "tests/controller", goal: "Complete two durable steps", currentStep: "prepare", state: { count: 0 } });
    assert.equal(flow.status, "QUEUED");
    let view = f.flows.linkTask({ ...scope(ownerKey, flow.flowId), taskId: task.taskId, expectedRevision: flow.revision, stepKey: "prepare" });
    flow = view.flow;
    assert.equal(view.tasks.length, 1);
    flow = f.flows.start({ ...scope(ownerKey, flow.flowId), expectedRevision: flow.revision, currentStep: "prepare" });
    flow = f.flows.setWaiting({ ...scope(ownerKey, flow.flowId), expectedRevision: flow.revision, currentStep: "review", wait: { kind: "approval" }, state: { count: 1 } });
    assert.equal(flow.status, "WAITING");
    flow = f.flows.resume({ ...scope(ownerKey, flow.flowId), expectedRevision: flow.revision, status: "RUNNING", currentStep: "review" });
    flow = f.flows.setBlocked({ ...scope(ownerKey, flow.flowId), expectedRevision: flow.revision, blockedTaskId: task.taskId, blockedSummary: "child needs correction" });
    assert.equal(flow.status, "BLOCKED");
    flow = f.flows.resume({ ...scope(ownerKey, flow.flowId), expectedRevision: flow.revision, status: "RUNNING", currentStep: "finish" });
    flow = f.flows.finish({ ...scope(ownerKey, flow.flowId), expectedRevision: flow.revision, state: { count: 2 } });
    assert.equal(flow.status, "SUCCEEDED");
    assert.ok(flow.endedAt);
    assert.throws(
      () => f.flows.resume({ ...scope(ownerKey, flow.flowId), expectedRevision: flow.revision, status: "RUNNING" }),
      (error) => error instanceof TaskFlowError && error.code === "TASK_FLOW_STATE_INVALID",
    );
    view = f.flows.get(scope(ownerKey, flow.flowId));
    assert.deepEqual(view.events.map((event) => event.eventType), [
      "taskFlow.created", "taskFlow.task.linked", "taskFlow.running", "taskFlow.waiting",
      "taskFlow.resumed", "taskFlow.blocked", "taskFlow.resumed", "taskFlow.succeeded",
    ]);
  } finally { await f.cleanup(); }
});

test("STEP020B one Task cannot be linked to two Task Flows and stale revisions fail closed", async () => {
  const f = await fixture("conflict");
  try {
    const run = send(f, "one", "shared child");
    const ownerKey = run.conversation.conversationId;
    const task = f.tasks.getByRun({ workspaceId: "alpha", runId: run.run.runId });
    const first = f.flows.create({ workspaceId: "alpha", ownerKey, controllerId: "tests/first", goal: "First" });
    const linked = f.flows.linkTask({ ...scope(ownerKey, first.flowId), taskId: task.taskId, expectedRevision: first.revision, stepKey: "one" });
    assert.throws(
      () => f.flows.start({ ...scope(ownerKey, first.flowId), expectedRevision: first.revision }),
      (error) => error instanceof TaskFlowError && error.code === "TASK_FLOW_REVISION_CONFLICT",
    );
    const second = f.flows.create({ workspaceId: "alpha", ownerKey, controllerId: "tests/second", goal: "Second" });
    assert.throws(
      () => f.flows.linkTask({ ...scope(ownerKey, second.flowId), taskId: task.taskId, expectedRevision: second.revision, stepKey: "one" }),
      (error) => error instanceof TaskFlowError && error.code === "TASK_FLOW_TASK_CONFLICT",
    );
    assert.equal(linked.tasks[0].taskId, task.taskId);
  } finally { await f.cleanup(); }
});

test("STEP020B Task Flow cancellation requests first, terminally cancels all active child Tasks, and replays", async () => {
  const f = await fixture("cancel");
  try {
    const ownerKey = f.conversations.create({ workspaceId: "alpha" }).conversationId;
    const firstRun = send(f, "one", "first active child", ownerKey);
    const secondRun = send(f, "two", "second active child", ownerKey);
    const firstTask = f.tasks.getByRun({ workspaceId: "alpha", runId: firstRun.run.runId });
    const secondTask = f.tasks.getByRun({ workspaceId: "alpha", runId: secondRun.run.runId });
    let flow = f.flows.create({ workspaceId: "alpha", ownerKey, controllerId: "tests/cancel", goal: "Cancel the graph", status: "RUNNING" });
    flow = f.flows.linkTask({ ...scope(ownerKey, flow.flowId), taskId: firstTask.taskId, expectedRevision: flow.revision, stepKey: "one" }).flow;
    flow = f.flows.linkTask({ ...scope(ownerKey, flow.flowId), taskId: secondTask.taskId, expectedRevision: flow.revision, stepKey: "two" }).flow;
    const cancelled = f.flows.cancel({ ...scope(ownerKey, flow.flowId), expectedRevision: flow.revision }, (task) => f.tasks.cancel(
      { workspaceId: task.workspaceId, taskId: task.taskId },
      (current) => f.conversations.cancel({ workspaceId: current.workspaceId, conversationId: current.conversationId, runId: current.runId }),
    ));
    assert.equal(cancelled.flow.flow.status, "CANCELLED");
    assert.equal(cancelled.affectedTasks, 2);
    assert.ok(cancelled.flow.flow.cancelRequestedAt);
    assert.deepEqual(cancelled.flow.tasks.map((entry) => entry.task.status), ["CANCELLED", "CANCELLED"]);
    assert.ok(cancelled.flow.events.some((event) => event.eventType === "taskFlow.cancel.requested"));
    assert.equal(cancelled.flow.events.at(-1)?.eventType, "taskFlow.cancelled");
    const replay = f.flows.cancel({ ...scope(ownerKey, flow.flowId), expectedRevision: cancelled.flow.flow.revision }, () => assert.fail("terminal flow cancellation must replay"));
    assert.equal(replay.replayed, true);
    assert.equal(replay.affectedTasks, 0);
  } finally { await f.cleanup(); }
});
