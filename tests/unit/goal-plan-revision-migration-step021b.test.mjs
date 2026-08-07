import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { applyStateMigrations, loadStateMigrations } from "../../packages/state/dist/index.js";

test("schema 24 snapshots the active Plan revision and backfills blocked Step retry and blocker state non-destructively", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  try {
    const migrations = await loadStateMigrations();
    applyStateMigrations(database, migrations.slice(0, 23), { profile: "step021b-upgrade", now: () => 10 });
    database.prepare(`
      INSERT INTO conversations
        (conversation_id, workspace_id, model_profile, title, status, last_message_sequence, created_at, updated_at)
      VALUES ('conversation-1', 'workspace-1', 'default', 'Goal owner', 'ACTIVE', 0, 1, 1)
    `).run();
    database.prepare(`
      INSERT INTO agent_goals
        (goal_id, workspace_id, conversation_id, objective, status, last_note,
         blocker_fingerprint, consecutive_blocker_count, continuation_count,
         plan_revision, source_run_id, source_attempt_id, created_at, updated_at,
         terminal_at, revision)
      VALUES ('goal-1', 'workspace-1', 'conversation-1', 'Upgrade Goal', 'BLOCKED',
              'Historical blocker', 'fingerprint', 1, 0, 3, NULL, NULL, 10, 20, NULL, 4)
    `).run();
    database.prepare(`
      INSERT INTO agent_goal_plan_steps
        (step_id, goal_id, ordinal, title, status, note, source_run_id,
         source_attempt_id, started_at, completed_at, updated_at, revision)
      VALUES ('step-1', 'goal-1', 1, 'Completed stable Step', 'COMPLETED', 'done', NULL, NULL, 11, 12, 12, 2),
             ('step-2', 'goal-1', 2, 'Blocked retry Step', 'BLOCKED', 'dependency missing', NULL, NULL, 13, NULL, 20, 3)
    `).run();
    database.prepare(`
      INSERT INTO task_flows
        (flow_id, workspace_id, controller_id, goal, status, current_step,
         blocked_task_id, blocked_summary, state_json, wait_json,
         cancel_requested_at, created_at, updated_at, ended_at, revision,
         owner_key, cleanup_after)
      VALUES ('flow-1', 'workspace-1', 'goal-plan-executor:goal-1', 'Upgrade Goal',
              'BLOCKED', 'step-2', NULL, 'dependency missing', NULL, NULL,
              NULL, 10, 20, NULL, 5, 'conversation-1', NULL)
    `).run();
    database.prepare(`
      INSERT INTO agent_goal_executions
        (goal_id, workspace_id, conversation_id, plan_revision, flow_id,
         controller_id, status, current_step_id, created_at, updated_at,
         ended_at, revision)
      VALUES ('goal-1', 'workspace-1', 'conversation-1', 3, 'flow-1',
              'goal-plan-executor:goal-1', 'BLOCKED', 'step-2', 10, 20, NULL, 6)
    `).run();
    database.prepare(`
      INSERT INTO agent_goal_step_executions
        (goal_id, step_id, plan_revision, ordinal, status, current_task_id,
         attempt_count, last_terminal_outcome, last_summary, started_at,
         completed_at, updated_at, revision)
      VALUES ('goal-1', 'step-1', 3, 1, 'SUCCEEDED', NULL, 1, 'SUCCEEDED', 'done', 11, 12, 12, 2),
             ('goal-1', 'step-2', 3, 2, 'BLOCKED', NULL, 2, 'BLOCKED', 'dependency missing', 13, 20, 20, 3)
    `).run();

    applyStateMigrations(database, migrations, { profile: "step021b-upgrade", now: () => 30 });

    assert.ok(database.prepare("PRAGMA user_version").get().user_version >= 24);
    const snapshots = database.prepare(`
      SELECT plan_revision planRevision, step_id stepId, ordinal, title,
             required, retry_mode retryMode, max_attempts maxAttempts
      FROM agent_goal_plan_revision_steps WHERE goal_id = 'goal-1'
      ORDER BY ordinal
    `).all().map((row) => ({ ...row }));
    assert.deepEqual(snapshots, [
      { planRevision: 3, stepId: "step-1", ordinal: 1, title: "Completed stable Step", required: 1, retryMode: "MANUAL", maxAttempts: 3 },
      { planRevision: 3, stepId: "step-2", ordinal: 2, title: "Blocked retry Step", required: 1, retryMode: "MANUAL", maxAttempts: 3 },
    ]);
    const step = database.prepare(`
      SELECT status, attempt_count attemptCount, retry_mode retryMode,
             max_attempts maxAttempts, next_retry_at nextRetryAt,
             last_retry_reason lastRetryReason
      FROM agent_goal_step_executions
      WHERE goal_id = 'goal-1' AND step_id = 'step-2' AND plan_revision = 3
    `).get();
    assert.deepEqual({ ...step }, {
      status: "BLOCKED", attemptCount: 2, retryMode: "MANUAL", maxAttempts: 3,
      nextRetryAt: null, lastRetryReason: null,
    });
    const blocker = database.prepare(`
      SELECT goal_id goalId, step_id stepId, plan_revision planRevision,
             blocker_type blockerType, summary, status, occurrence_count occurrenceCount,
             revision
      FROM agent_goal_step_blockers
    `).get();
    assert.equal(blocker.goalId, "goal-1");
    assert.equal(blocker.stepId, "step-2");
    assert.equal(blocker.planRevision, 3);
    assert.equal(blocker.blockerType, "TASK_OUTPUT");
    assert.equal(blocker.summary, "dependency missing");
    assert.equal(blocker.status, "OPEN");
    assert.equal(blocker.occurrenceCount, 1);
    assert.equal(blocker.revision, 1);
    assert.equal(database.prepare("SELECT COUNT(*) count FROM task_completion_deliveries").get().count, 0);
    const deliveryColumns = database.prepare("PRAGMA table_info(task_completion_deliveries)").all().map((row) => row.name);
    for (const column of ["controller_execution_revision", "controller_step_revision", "controller_flow_revision"]) assert.ok(deliveryColumns.includes(column));
  } finally {
    database.close();
  }
});
