import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveProfilePaths } from "../../packages/config/dist/index.js";
import { openOpenRillStateDatabase } from "../../packages/state/dist/index.js";
import { ConversationService } from "../../packages/conversations/dist/index.js";
import { TaskMaintenanceService, TaskService } from "../../packages/tasks/dist/index.js";

async function fixture(name) {
  const root = await mkdtemp(join(tmpdir(), `openrill-step020d-task-${name}-`));
  const paths = resolveProfilePaths({ profile: `step020d-task-${name}`, env: { OPENRILL_DATA_ROOT: join(root, "data"), OPENRILL_CONFIG_ROOT: join(root, "config") } });
  let clock = 1_000;
  let id = 0;
  const now = () => clock;
  const state = await openOpenRillStateDatabase({ profilePaths: paths, now });
  const conversations = new ConversationService({ state, workspaceIds: ["alpha"], now, createId: () => `step020d-${++id}` });
  const tasks = new TaskService(state, ["alpha"]);
  const createRun = (key) => {
    const conversation = conversations.create({ workspaceId: "alpha", title: key });
    const sent = conversations.send({ workspaceId: "alpha", conversationId: conversation.conversationId, submissionKey: key, text: key });
    return { conversation, sent, task: tasks.getByRun({ workspaceId: "alpha", runId: sent.run.runId }) };
  };
  return {
    root, state, conversations, tasks, now,
    setNow(value) { clock = value; },
    advance(value) { clock += value; },
    createRun,
    cleanup: async () => { state.close(); await rm(root, { recursive: true, force: true }); },
  };
}

function overwriteTask(state, taskId, patch) {
  return state.transaction((repositories) => {
    const current = repositories.tasks.get(taskId);
    assert.ok(current);
    const updated = repositories.tasks.update({
      taskId: current.taskId,
      expectedRevision: current.revision,
      parentTaskId: current.parentTaskId,
      runtime: current.runtime,
      taskKind: current.taskKind,
      sourceId: current.sourceId,
      status: patch.status ?? current.status,
      recoveryState: patch.recoveryState ?? current.recoveryState,
      progressSummary: patch.progressSummary === undefined ? current.progressSummary : patch.progressSummary,
      terminalSummary: patch.terminalSummary === undefined ? current.terminalSummary : patch.terminalSummary,
      errorCode: patch.errorCode === undefined ? current.errorCode : patch.errorCode,
      startedAt: patch.startedAt === undefined ? current.startedAt : patch.startedAt,
      endedAt: patch.endedAt === undefined ? current.endedAt : patch.endedAt,
      updatedAt: patch.updatedAt ?? current.updatedAt,
      ...(Object.hasOwn(patch, "cleanupAfter") ? { cleanupAfter: patch.cleanupAfter } : {}),
    });
    assert.ok(updated);
    return updated;
  });
}

test("STEP020D Task reconcile projects authoritative terminal Run state and schedules retention idempotently", async () => {
  const f = await fixture("projection");
  try {
    const record = f.createRun("projection");
    f.conversations.transitionRun({ runId: record.sent.run.runId, status: "RUNNING" });
    f.conversations.transitionRun({ runId: record.sent.run.runId, status: "COMPLETED" });
    overwriteTask(f.state, record.task.taskId, { status: "RUNNING", terminalSummary: null, errorCode: null, endedAt: null, updatedAt: f.now() });
    const maintenance = new TaskMaintenanceService({ state: f.state, workspaceIds: ["alpha"], now: f.now, runtimeAuthorityAvailable: () => false });

    const audit = maintenance.audit({ workspaceId: "alpha" });
    assert.ok(audit.findings.some((finding) => finding.code === "TASK_RUN_STATUS_DRIFT" && finding.repairPolicy === "SAFE_REPAIR"));
    const applied = maintenance.reconcile({ workspaceId: "alpha", mode: "APPLY" });
    assert.equal(applied.reconciled, 1);
    assert.equal(applied.retentionScheduled, 1);
    const task = f.tasks.get({ workspaceId: "alpha", taskId: record.task.taskId }).task;
    assert.equal(task.status, "SUCCEEDED");
    assert.equal(task.cleanupAfter, task.endedAt + 30 * 24 * 60 * 60_000);
    const replay = maintenance.reconcile({ workspaceId: "alpha", mode: "APPLY" });
    assert.equal(replay.decisions.length, 0);
  } finally { await f.cleanup(); }
});

test("STEP020D runtime authority loss fails the owning Run and projects Task LOST only after recovery grace", async () => {
  const f = await fixture("lost");
  try {
    const record = f.createRun("lost");
    const marked = [];
    const maintenance = new TaskMaintenanceService({
      state: f.state,
      workspaceIds: ["alpha"],
      now: f.now,
      hostStartedAt: f.now(),
      runtimeAuthorityAvailable: () => true,
      isRunActive: () => false,
      isRunExpectedIdle: () => false,
      markRunLost: (runId) => { marked.push(runId); f.conversations.markExecutionLost(runId); },
    });
    assert.equal(maintenance.audit({ workspaceId: "alpha" }).findings.some((finding) => finding.code === "RUNTIME_AUTHORITY_MISSING"), false);
    f.advance(5 * 60_000 + 1);
    const preview = maintenance.reconcile({ workspaceId: "alpha", mode: "PREVIEW" });
    assert.equal(preview.lost, 0);
    assert.ok(preview.decisions.some((decision) => decision.action === "MARK_RUNTIME_LOST" && decision.applied === false));
    const applied = maintenance.reconcile({ workspaceId: "alpha", mode: "APPLY" });
    assert.equal(applied.lost, 1);
    assert.deepEqual(marked, [record.sent.run.runId]);
    const snapshot = f.state.transaction((repositories) => ({
      run: repositories.conversations.getRun(record.sent.run.runId),
      task: repositories.tasks.get(record.task.taskId),
      events: repositories.tasks.listEvents(record.task.taskId, 100),
    }));
    assert.equal(snapshot.run.status, "FAILED");
    assert.equal(snapshot.run.recoveryState, "NON_RESUMABLE");
    assert.equal(snapshot.task.status, "LOST");
    assert.equal(snapshot.task.errorCode, "RUNTIME_AUTHORITY_LOST");
    assert.ok(snapshot.events.some((event) => event.eventType === "task.lost"));
    assert.ok(snapshot.events.some((event) => event.eventType === "task.retention.scheduled"));
    assert.equal(maintenance.reconcile({ workspaceId: "alpha", mode: "APPLY" }).decisions.length, 0);

    f.setNow(snapshot.task.cleanupAfter + 1);
    const retention = maintenance.retentionPreview({ workspaceId: "alpha" });
    assert.deepEqual(retention.candidates.map((candidate) => candidate.taskId), [record.task.taskId]);
  } finally { await f.cleanup(); }
});

test("STEP020D expected-idle Runs are not LOST and terminal-Task/active-Run conflicts stay report-only and retention-protected", async () => {
  const f = await fixture("safety");
  try {
    const idle = f.createRun("expected-idle");
    const inconsistent = f.createRun("inconsistent");
    overwriteTask(f.state, inconsistent.task.taskId, {
      status: "LOST", recoveryState: "NON_RESUMABLE", terminalSummary: "Lost", errorCode: "FIXTURE_DRIFT",
      startedAt: f.now(), endedAt: f.now(), cleanupAfter: null, updatedAt: f.now(),
    });
    f.advance(10 * 60_000);
    const maintenance = new TaskMaintenanceService({
      state: f.state,
      workspaceIds: ["alpha"],
      now: f.now,
      hostStartedAt: 1_000,
      runtimeAuthorityAvailable: () => true,
      isRunActive: () => false,
      isRunExpectedIdle: (runId) => runId === idle.sent.run.runId,
      markRunLost: () => assert.fail("expected-idle and report-only conflicts must not be marked LOST"),
    });
    const audit = maintenance.audit({ workspaceId: "alpha" });
    assert.equal(audit.findings.some((finding) => finding.runId === idle.sent.run.runId && finding.code === "RUNTIME_AUTHORITY_MISSING"), false);
    assert.ok(audit.findings.some((finding) => finding.runId === inconsistent.sent.run.runId && finding.code === "TASK_TERMINAL_RUN_ACTIVE" && finding.repairPolicy === "REPORT_ONLY"));
    assert.equal(audit.findings.some((finding) => finding.runId === inconsistent.sent.run.runId && finding.code === "MISSING_CLEANUP"), false);
    const result = maintenance.reconcile({ workspaceId: "alpha", mode: "APPLY" });
    assert.equal(result.retentionScheduled, 0);
    const task = f.tasks.get({ workspaceId: "alpha", taskId: inconsistent.task.taskId }).task;
    assert.equal(task.status, "LOST");
    assert.equal(task.cleanupAfter, null);
    const retention = maintenance.retentionPreview({ workspaceId: "alpha" });
    assert.equal(retention.candidates.length, 0);
    assert.ok(retention.protectedActive >= 2);
  } finally { await f.cleanup(); }
});
