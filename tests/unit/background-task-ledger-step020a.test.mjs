import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService, DelegationService } from "../../packages/conversations/dist/index.js";
import { TaskService } from "../../packages/tasks/dist/index.js";

function ids(prefix) { let n = 0; return () => `${prefix}-${++n}`; }
function budget(overrides = {}) { return { maxTurns: 8, maxModelCalls: 10, maxToolCalls: 16, maxOutputTokens: 128, maxTotalTokens: 4096, maxDurationMs: 60_000, maxDelegationDepth: 2, maxActiveChildren: 2, maxTotalChildren: 4, ...overrides }; }
function scope(overrides = {}) { return { workspaceIds: ["alpha"], skillIds: ["research"], toolNames: ["workspace.read"], ...overrides }; }

async function fixture(name) {
  const root = await mkdtemp(join(tmpdir(), `openrill-step020a-${name}-`));
  const env = { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") };
  const paths = resolveProfilePaths({ profile: name, env });
  let clock = 1000;
  const now = () => ++clock;
  const state = await openOpenRillStateDatabase({ profilePaths: paths, now });
  const createId = ids(name);
  const conversations = new ConversationService({ state, workspaceIds: ["alpha"], createId, now });
  const delegations = new DelegationService({ state, workspaceIds: ["alpha"], createId, now });
  const tasks = new TaskService(state, ["alpha"]);
  const conversation = conversations.create({ workspaceId: "alpha", modelProfile: "default" });
  const sent = conversations.send({ workspaceId: "alpha", conversationId: conversation.conversationId, submissionKey: "root", text: "perform durable background work" });
  return { root, paths, state, conversations, delegations, tasks, sent, now, cleanup: async () => { if (state.isOpen()) state.close(); await rm(root, { recursive: true, force: true }); } };
}

test("STEP020A migration 018 owns an independent durable Task ledger", async () => {
  const f = await fixture("schema");
  try {
    assert.ok(f.state.schemaVersion >= 18);
    assert.ok(f.state.appliedMigrations.some((migration) => migration.name === "durable_background_task_ledger"));
    const db = new DatabaseSync(f.state.diagnostics().databasePath, { readOnly: true });
    try {
      for (const table of ["background_tasks", "background_task_events"]) {
        assert.equal(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name=?").get(table)?.name, table);
      }
    } finally { db.close(); }
  } finally { await f.cleanup(); }
});

test("STEP020A Run creation and lifecycle are transactionally mirrored without making Task a scheduler", async () => {
  const f = await fixture("lifecycle");
  try {
    const queued = f.tasks.getByRun({ workspaceId: "alpha", runId: f.sent.run.runId });
    assert.equal(queued.taskId, `task:${f.sent.run.runId}`);
    assert.equal(queued.status, "QUEUED");
    assert.equal(queued.runtime, "CONVERSATION");
    assert.equal(queued.task, "perform durable background work");

    f.conversations.transitionRun({ runId: f.sent.run.runId, status: "RUNNING" });
    assert.equal(f.tasks.getByRun({ workspaceId: "alpha", runId: f.sent.run.runId }).status, "RUNNING");
    f.conversations.transitionRun({ runId: f.sent.run.runId, status: "COMPLETED" });
    const done = f.tasks.get({ workspaceId: "alpha", taskId: queued.taskId });
    assert.equal(done.task.status, "SUCCEEDED");
    assert.equal(done.task.terminalSummary, "Completed");
    assert.deepEqual(done.events.map((event) => event.eventType), ["task.queued", "task.running", "task.succeeded"]);
  } finally { await f.cleanup(); }
});

test("STEP020A resumable Host interruption preserves an already-started Task as RUNNING", async () => {
  const f = await fixture("resume");
  try {
    const started = f.conversations.startExecution({
      runId: f.sent.run.runId, providerId: "fixture", modelId: "fixture-model",
      budget: { maxTurns: 4, maxModelCalls: 4, maxToolCalls: 4, maxOutputTokens: 64, maxTotalTokens: 1024, maxDurationMs: 60_000 },
    });
    f.conversations.appendEvent({ runId: f.sent.run.runId, attemptId: started.attempt.attemptId, eventType: "run.checkpoint", payload: { durable: true } });
    const classification = f.conversations.interruptExecution(f.sent.run.runId);
    assert.equal(classification.status, "CREATED");
    assert.equal(classification.recoveryState, "RESUMABLE");
    const task = f.tasks.getByRun({ workspaceId: "alpha", runId: f.sent.run.runId });
    assert.equal(task.status, "RUNNING");
    assert.equal(task.recoveryState, "RESUMABLE");
    assert.equal(task.progressSummary, "Waiting for host resume");
  } finally { await f.cleanup(); }
});

test("STEP020A delegated Runs become child Tasks with explicit parent linkage", async () => {
  const f = await fixture("delegation");
  try {
    f.delegations.configureRootBudget({ runId: f.sent.run.runId, budget: budget(), scope: scope() });
    const child = f.delegations.createDelegatedRun({
      parentRunId: f.sent.run.runId, parentAttemptId: f.sent.run.currentAttemptId,
      idempotencyKey: "child", task: "inspect repository contracts", workspaceId: "alpha",
      budget: budget({ maxTurns: 2, maxModelCalls: 2, maxToolCalls: 2, maxTotalTokens: 512, maxDurationMs: 30_000, maxActiveChildren: 0, maxTotalChildren: 0 }),
      scope: scope(), expectedOutput: "TEXT",
    });
    const parentTask = f.tasks.getByRun({ workspaceId: "alpha", runId: f.sent.run.runId });
    const childTask = f.tasks.getByRun({ workspaceId: "alpha", runId: child.delegation.childRunId });
    assert.equal(childTask.runtime, "DELEGATION");
    assert.equal(childTask.taskKind, "agent.delegation");
    assert.equal(childTask.sourceId, child.delegation.delegationId);
    assert.equal(childTask.parentTaskId, parentTask.taskId);
    assert.equal(childTask.task, "inspect repository contracts");
  } finally { await f.cleanup(); }
});

test("STEP020A Task cancellation delegates authority to the owning Run lifecycle", async () => {
  const f = await fixture("cancel");
  try {
    const task = f.tasks.getByRun({ workspaceId: "alpha", runId: f.sent.run.runId });
    const cancelled = f.tasks.cancel({ workspaceId: "alpha", taskId: task.taskId }, (current) => {
      f.conversations.cancel({ workspaceId: current.workspaceId, conversationId: current.conversationId, runId: current.runId });
    });
    assert.equal(cancelled.status, "CANCELLED");
    assert.equal(f.conversations.executionContext(f.sent.run.runId).run.status, "CANCELLED");
    const replay = f.tasks.cancel({ workspaceId: "alpha", taskId: task.taskId }, () => assert.fail("terminal Task cancellation must replay"));
    assert.equal(replay.status, "CANCELLED");
  } finally { await f.cleanup(); }
});
