import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { TaskService } from "../../packages/tasks/dist/index.js";
import { TaskFlowError, TaskFlowService } from "../../packages/task-flows/dist/index.js";

async function fixture(name) {
  const root = await mkdtemp(join(tmpdir(), `openrill-step020br1-${name}-`));
  const paths = resolveProfilePaths({ profile: name, env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  let clock = 5000;
  const now = () => ++clock;
  const state = await openOpenRillStateDatabase({ profilePaths: paths, now });
  let id = 0;
  const conversations = new ConversationService({ state, workspaceIds: ["alpha"], createId: () => `${name}-${++id}`, now });
  const tasks = new TaskService(state, ["alpha"]);
  const flows = new TaskFlowService(state, tasks, ["alpha"], now);
  return { root, state, conversations, tasks, flows, cleanup: async () => { if (state.isOpen()) state.close(); await rm(root, { recursive: true, force: true }); } };
}

function submit(f, ownerKey, key, text) {
  return f.conversations.send({ workspaceId: "alpha", conversationId: ownerKey, submissionKey: key, text });
}

function taskFor(f, sent) {
  return f.tasks.getByRun({ workspaceId: "alpha", runId: sent.run.runId });
}

function scope(ownerKey, flowId) {
  return { workspaceId: "alpha", ownerKey, flowId };
}

test("STEP020BR1 migration 020 backfills single-owner flows and isolates mixed or unlinked legacy flows", async () => {
  const db = new DatabaseSync(":memory:", { enableForeignKeyConstraints: true });
  try {
    db.exec(`
      CREATE TABLE background_tasks (task_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL) STRICT;
      CREATE TABLE task_flows (flow_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, updated_at INTEGER NOT NULL) STRICT;
      CREATE TABLE task_flow_tasks (flow_id TEXT NOT NULL, task_id TEXT NOT NULL UNIQUE, step_key TEXT, linked_at INTEGER NOT NULL) STRICT;
      INSERT INTO background_tasks VALUES ('task-a1','conversation-a'),('task-a2','conversation-a'),('task-a3','conversation-a'),('task-b','conversation-b');
      INSERT INTO task_flows VALUES ('single','alpha',1),('mixed','alpha',2),('empty','alpha',3);
      INSERT INTO task_flow_tasks VALUES ('single','task-a1','one',1),('single','task-a2','two',2),('mixed','task-b','one',1);
      INSERT INTO task_flow_tasks VALUES ('mixed','task-a3','two',2);
    `);
    const migration = await readFile(new URL("../../packages/state/migrations/020_task_flow_owner_scope_and_cancel_admission.sql", import.meta.url), "utf8");
    db.exec(migration);
    const rows = db.prepare("SELECT flow_id flowId, owner_key ownerKey FROM task_flows ORDER BY flow_id").all().map((row) => ({ flowId: row.flowId, ownerKey: row.ownerKey }));
    assert.deepEqual(rows, [
      { flowId: "empty", ownerKey: "legacy:empty" },
      { flowId: "mixed", ownerKey: "legacy:mixed" },
      { flowId: "single", ownerKey: "conversation-a" },
    ]);
    assert.throws(() => db.prepare("INSERT INTO task_flows(flow_id,workspace_id,updated_at) VALUES('invalid','alpha',4)").run());
  } finally { db.close(); }
});

test("STEP020BR1 Flow ownership is Conversation-scoped and same-workspace cross-owner Task admission fails closed", async () => {
  const f = await fixture("owner");
  try {
    const ownerA = f.conversations.create({ workspaceId: "alpha" }).conversationId;
    const ownerB = f.conversations.create({ workspaceId: "alpha" }).conversationId;
    const taskA = taskFor(f, submit(f, ownerA, "a", "owner A task"));
    const taskB = taskFor(f, submit(f, ownerB, "b", "owner B task"));
    let flow = f.flows.create({ workspaceId: "alpha", ownerKey: ownerA, controllerId: "tests/owner", goal: "Owner isolated flow" });
    assert.equal(flow.ownerKey, ownerA);
    flow = f.flows.linkTask({ ...scope(ownerA, flow.flowId), taskId: taskA.taskId, expectedRevision: flow.revision, stepKey: "a" }).flow;
    assert.throws(
      () => f.flows.linkTask({ ...scope(ownerA, flow.flowId), taskId: taskB.taskId, expectedRevision: flow.revision, stepKey: "b" }),
      (error) => error instanceof TaskFlowError && error.code === "TASK_FLOW_ACCESS_DENIED",
    );
    assert.throws(
      () => f.flows.get(scope(ownerB, flow.flowId)),
      (error) => error instanceof TaskFlowError && error.code === "TASK_FLOW_ACCESS_DENIED",
    );
    assert.deepEqual(f.flows.list({ workspaceId: "alpha", ownerKey: ownerB }), []);
    const reverse = f.flows.getByTask({ workspaceId: "alpha", ownerKey: ownerA, taskId: taskA.taskId });
    assert.equal(reverse?.flow.flowId, flow.flowId);
    assert.equal(f.flows.getByTask({ workspaceId: "alpha", ownerKey: ownerA, taskId: taskB.taskId }), null);
    assert.throws(
      () => f.flows.create({ workspaceId: "alpha", ownerKey: "missing-conversation", controllerId: "tests/owner", goal: "Invalid owner" }),
      (error) => error instanceof TaskFlowError && error.code === "TASK_FLOW_NOT_FOUND",
    );
  } finally { await f.cleanup(); }
});

test("STEP020BR1 cancellation request closes new Task admission while preserving exact link replay", async () => {
  const f = await fixture("cancel-admission");
  try {
    const ownerKey = f.conversations.create({ workspaceId: "alpha" }).conversationId;
    const first = taskFor(f, submit(f, ownerKey, "one", "first task"));
    const second = taskFor(f, submit(f, ownerKey, "two", "second task"));
    let flow = f.flows.create({ workspaceId: "alpha", ownerKey, controllerId: "tests/cancel-admission", goal: "Close admission", status: "RUNNING" });
    let view = f.flows.linkTask({ ...scope(ownerKey, flow.flowId), taskId: first.taskId, expectedRevision: flow.revision, stepKey: "one" });
    flow = f.flows.requestCancel({ ...scope(ownerKey, flow.flowId), expectedRevision: view.flow.revision });
    assert.ok(flow.cancelRequestedAt);
    assert.throws(
      () => f.flows.linkTask({ ...scope(ownerKey, flow.flowId), taskId: second.taskId, expectedRevision: flow.revision, stepKey: "two" }),
      (error) => error instanceof TaskFlowError && error.code === "TASK_FLOW_STATE_INVALID" && /cancellation/.test(error.message),
    );
    view = f.flows.linkTask({ ...scope(ownerKey, flow.flowId), taskId: first.taskId, expectedRevision: flow.revision, stepKey: "one" });
    assert.equal(view.flow.revision, flow.revision);
    assert.deepEqual(view.tasks.map((entry) => entry.taskId), [first.taskId]);
  } finally { await f.cleanup(); }
});

test("STEP020BR1 registry attachment policy explicitly permits a terminal same-owner Task", async () => {
  const f = await fixture("terminal-attachment");
  try {
    const ownerKey = f.conversations.create({ workspaceId: "alpha" }).conversationId;
    const sent = submit(f, ownerKey, "done", "completed task retained for durable history");
    f.conversations.transitionRun({ runId: sent.run.runId, status: "RUNNING" });
    f.conversations.transitionRun({ runId: sent.run.runId, status: "COMPLETED" });
    const task = taskFor(f, sent);
    assert.equal(task.status, "SUCCEEDED");
    const flow = f.flows.create({ workspaceId: "alpha", ownerKey, controllerId: "tests/history", goal: "Retain completed task history" });
    const linked = f.flows.linkTask({ ...scope(ownerKey, flow.flowId), taskId: task.taskId, expectedRevision: flow.revision, stepKey: "history" });
    assert.equal(linked.tasks[0].task.status, "SUCCEEDED");
  } finally { await f.cleanup(); }
});
