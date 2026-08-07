import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { applyStateMigrations, loadStateMigrations } from "../../packages/state/dist/index.js";

function insertTerminalChild(database, input) {
  const createdAt = input.createdAt ?? 100;
  const endedAt = input.endedAt ?? createdAt + 10;
  database.prepare(`
    INSERT INTO conversations
      (conversation_id, workspace_id, model_profile, title, status,
       last_message_sequence, created_at, updated_at)
    VALUES (?, ?, 'default', ?, 'ACTIVE', 1, ?, ?)
  `).run(input.conversationId, input.workspaceId, input.conversationId, createdAt, endedAt);
  database.prepare(`
    INSERT INTO conversation_messages
      (message_id, conversation_id, sequence, role, content_json, created_at)
    VALUES (?, ?, 1, 'assistant', ?, ?)
  `).run(`${input.taskId}:message`, input.conversationId, JSON.stringify({ text: input.output ?? "Historical result" }), endedAt);
  database.prepare(`
    INSERT INTO agent_runs
      (run_id, conversation_id, trigger_message_id, status, recovery_state,
       current_attempt_id, last_event_sequence, created_at, started_at,
       ended_at, updated_at)
    VALUES (?, ?, ?, 'COMPLETED', 'NONE', NULL, 0, ?, ?, ?, ?)
  `).run(input.runId, input.conversationId, `${input.taskId}:message`, createdAt, createdAt, endedAt, endedAt);
  database.prepare(`
    INSERT INTO background_tasks
      (task_id, workspace_id, conversation_id, run_id, parent_task_id,
       runtime, task_kind, source_id, task_text, status, recovery_state,
       progress_summary, terminal_summary, error_code, created_at,
       started_at, ended_at, updated_at, revision, cleanup_after)
    VALUES (?, ?, ?, ?, NULL, 'CONVERSATION', 'task_flow.child', ?, ?,
            'SUCCEEDED', 'NONE', NULL, 'Completed', NULL, ?, ?, ?, ?, 2, NULL)
  `).run(
    input.taskId, input.workspaceId, input.conversationId, input.runId,
    input.flowId, input.taskText ?? "Do historical work", createdAt, createdAt,
    endedAt, endedAt,
  );
  database.prepare(`
    INSERT INTO background_task_events
      (task_id, sequence, event_type, status, recovery_state,
       payload_json, run_event_sequence, emitted_at)
    VALUES (?, 1, 'task.created', 'QUEUED', 'NONE', '{}', NULL, ?),
           (?, 2, 'task.succeeded', 'SUCCEEDED', 'NONE', '{}', NULL, ?)
  `).run(input.taskId, createdAt, input.taskId, endedAt);
  database.prepare(`
    INSERT INTO task_flows
      (flow_id, workspace_id, controller_id, goal, status, current_step,
       blocked_task_id, blocked_summary, state_json, wait_json,
       cancel_requested_at, created_at, updated_at, ended_at, revision,
       owner_key, cleanup_after)
    VALUES (?, ?, ?, ?, ?, 'step-1', NULL, NULL, NULL, NULL, ?, ?, ?, ?, 2, ?, NULL)
  `).run(
    input.flowId, input.workspaceId, input.controllerId ?? "controller-1",
    input.goal ?? "Historical flow", input.flowStatus ?? "RUNNING",
    input.cancelRequestedAt ?? null, createdAt, endedAt,
    input.flowStatus === "SUCCEEDED" ? endedAt : null,
    input.ownerKey ?? input.conversationId,
  );
  database.prepare(`
    INSERT INTO task_flow_tasks (flow_id, task_id, step_key, linked_at)
    VALUES (?, ?, 'step-1', ?)
  `).run(input.flowId, input.taskId, createdAt);
}

test("schema 22 backfills only safely-owned active terminal child Tasks for controller review", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  try {
    const migrations = await loadStateMigrations();
    applyStateMigrations(database, migrations.slice(0, 21), { profile: "step020e-upgrade", now: () => 10 });

    insertTerminalChild(database, {
      taskId: "task-eligible", runId: "run-eligible", flowId: "flow-eligible",
      conversationId: "conversation-eligible", workspaceId: "workspace-1",
    });
    insertTerminalChild(database, {
      taskId: "task-terminal-flow", runId: "run-terminal-flow", flowId: "flow-terminal",
      conversationId: "conversation-terminal", workspaceId: "workspace-1", flowStatus: "SUCCEEDED",
    });
    insertTerminalChild(database, {
      taskId: "task-cancelling", runId: "run-cancelling", flowId: "flow-cancelling",
      conversationId: "conversation-cancelling", workspaceId: "workspace-1", cancelRequestedAt: 105,
    });
    insertTerminalChild(database, {
      taskId: "task-owner-mismatch", runId: "run-owner-mismatch", flowId: "flow-owner-mismatch",
      conversationId: "conversation-child", workspaceId: "workspace-1", ownerKey: "conversation-other",
    });
    database.prepare(`
      INSERT INTO conversations
        (conversation_id, workspace_id, model_profile, title, status,
         last_message_sequence, created_at, updated_at)
      VALUES ('conversation-other', 'workspace-1', 'default', 'Other', 'ACTIVE', 0, 1, 1)
    `).run();

    applyStateMigrations(database, migrations, { profile: "step020e-upgrade", now: () => 20 });

    const eligible = database.prepare(`
      SELECT notify_policy notifyPolicy, delivery_status deliveryStatus,
             terminal_outcome terminalOutcome, terminal_summary terminalSummary
      FROM background_tasks WHERE task_id = 'task-eligible'
    `).get();
    assert.deepEqual({ ...eligible }, {
      notifyPolicy: "DONE_ONLY",
      deliveryStatus: "PENDING",
      terminalOutcome: "BLOCKED",
      terminalSummary: "Historical completion requires controller review.",
    });

    const delivery = database.prepare(`
      SELECT task_id taskId, task_event_sequence taskEventSequence,
             flow_id flowId, owner_conversation_id ownerConversationId,
             delivery_status deliveryStatus, terminal_outcome terminalOutcome,
             payload_json payloadJson
      FROM task_completion_deliveries
    `).get();
    assert.equal(delivery.taskId, "task-eligible");
    assert.equal(delivery.taskEventSequence, 2);
    assert.equal(delivery.flowId, "flow-eligible");
    assert.equal(delivery.ownerConversationId, "conversation-eligible");
    assert.equal(delivery.deliveryStatus, "PENDING");
    assert.equal(delivery.terminalOutcome, "BLOCKED");
    assert.deepEqual(JSON.parse(delivery.payloadJson), {
      output: "",
      terminalSummary: "Historical completion requires controller review.",
      errorCode: null,
      historicalBackfill: true,
    });

    const backfillEvent = database.prepare(`
      SELECT sequence, event_type eventType, status, payload_json payloadJson
      FROM background_task_events
      WHERE task_id = 'task-eligible'
      ORDER BY sequence DESC LIMIT 1
    `).get();
    assert.equal(backfillEvent.sequence, 3);
    assert.equal(backfillEvent.eventType, "task.delivery.backfilled");
    assert.equal(backfillEvent.status, "SUCCEEDED");
    assert.equal(JSON.parse(backfillEvent.payloadJson).historicalReview, true);

    assert.equal(database.prepare("SELECT COUNT(*) count FROM task_completion_deliveries").get().count, 1);
    for (const taskId of ["task-terminal-flow", "task-cancelling", "task-owner-mismatch"]) {
      const row = database.prepare(`
        SELECT notify_policy notifyPolicy, delivery_status deliveryStatus,
               terminal_outcome terminalOutcome
        FROM background_tasks WHERE task_id = ?
      `).get(taskId);
      assert.deepEqual({ ...row }, {
        notifyPolicy: "DONE_ONLY",
        deliveryStatus: "NOT_APPLICABLE",
        terminalOutcome: null,
      });
    }
  } finally {
    database.close();
  }
});
