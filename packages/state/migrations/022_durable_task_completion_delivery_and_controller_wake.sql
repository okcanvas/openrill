ALTER TABLE background_tasks
  ADD COLUMN notify_policy TEXT NOT NULL DEFAULT 'SILENT'
  CHECK (notify_policy IN ('DONE_ONLY','STATE_CHANGES','SILENT'));

ALTER TABLE background_tasks
  ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE'
  CHECK (delivery_status IN ('PENDING','SESSION_QUEUED','DELIVERED','FAILED','NOT_APPLICABLE'));

ALTER TABLE background_tasks
  ADD COLUMN terminal_outcome TEXT
  CHECK (terminal_outcome IS NULL OR terminal_outcome IN ('SUCCEEDED','BLOCKED'));

UPDATE background_tasks
SET notify_policy = 'DONE_ONLY'
WHERE task_kind = 'task_flow.child';

CREATE TABLE task_completion_deliveries (
  delivery_id TEXT NOT NULL PRIMARY KEY,
  task_id TEXT NOT NULL,
  task_event_sequence INTEGER NOT NULL CHECK (task_event_sequence > 0),
  flow_id TEXT,
  workspace_id TEXT NOT NULL,
  owner_conversation_id TEXT NOT NULL,
  controller_id TEXT,
  notify_policy TEXT NOT NULL CHECK (notify_policy IN ('DONE_ONLY','STATE_CHANGES','SILENT')),
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('PENDING','SESSION_QUEUED','DELIVERED','FAILED','NOT_APPLICABLE')),
  task_status TEXT NOT NULL CHECK (task_status IN ('SUCCEEDED','FAILED','TIMED_OUT','CANCELLED','LOST')),
  terminal_outcome TEXT CHECK (terminal_outcome IS NULL OR terminal_outcome IN ('SUCCEEDED','BLOCKED')),
  idempotency_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND length(payload_json) <= 262144),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  system_message_id TEXT,
  wake_run_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  delivered_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  UNIQUE (task_id, task_event_sequence),
  CHECK (length(delivery_id) BETWEEN 1 AND 256),
  CHECK (length(workspace_id) BETWEEN 1 AND 64),
  CHECK (length(owner_conversation_id) BETWEEN 1 AND 256),
  CHECK (controller_id IS NULL OR length(controller_id) BETWEEN 1 AND 128),
  CHECK (length(idempotency_key) BETWEEN 1 AND 256),
  CHECK (updated_at >= created_at),
  CHECK (delivered_at IS NULL OR delivered_at >= created_at),
  FOREIGN KEY (task_id, task_event_sequence)
    REFERENCES background_task_events(task_id, sequence) ON DELETE CASCADE,
  FOREIGN KEY (flow_id) REFERENCES task_flows(flow_id) ON DELETE SET NULL,
  FOREIGN KEY (owner_conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (system_message_id) REFERENCES conversation_messages(message_id) ON DELETE SET NULL,
  FOREIGN KEY (wake_run_id) REFERENCES agent_runs(run_id) ON DELETE SET NULL
) STRICT;

CREATE INDEX idx_task_completion_deliveries_pending
  ON task_completion_deliveries(delivery_status, updated_at, delivery_id)
  WHERE delivery_status IN ('PENDING','SESSION_QUEUED','FAILED');

CREATE INDEX idx_task_completion_deliveries_owner
  ON task_completion_deliveries(workspace_id, owner_conversation_id, created_at, delivery_id);

CREATE INDEX idx_task_completion_deliveries_flow
  ON task_completion_deliveries(flow_id, created_at, delivery_id)
  WHERE flow_id IS NOT NULL;

CREATE INDEX idx_task_completion_deliveries_wake_run
  ON task_completion_deliveries(wake_run_id)
  WHERE wake_run_id IS NOT NULL;


-- Upgrade-safe continuation: STEP020D could already contain terminal managed child Tasks.
-- Only provably owned, active, non-cancelling Flows are eligible. Historical SUCCEEDED
-- Tasks require controller review because schema 21 did not enforce required-completion semantics.
INSERT INTO task_completion_deliveries (
  delivery_id, task_id, task_event_sequence, flow_id, workspace_id,
  owner_conversation_id, controller_id, notify_policy, delivery_status,
  task_status, terminal_outcome, idempotency_key, payload_json,
  attempt_count, last_error, system_message_id, wake_run_id,
  created_at, updated_at, delivered_at, revision
)
SELECT
  printf('delivery:m22:%016x', terminal_event.rowid),
  task.task_id,
  terminal_event.sequence,
  flow.flow_id,
  task.workspace_id,
  task.conversation_id,
  flow.controller_id,
  'DONE_ONLY',
  'PENDING',
  task.status,
  CASE WHEN task.status = 'SUCCEEDED' THEN 'BLOCKED' ELSE NULL END,
  printf('migration22:%016x', terminal_event.rowid),
  json_object(
    'output', '',
    'terminalSummary', CASE
      WHEN task.status = 'SUCCEEDED' THEN 'Historical completion requires controller review.'
      ELSE task.terminal_summary
    END,
    'errorCode', task.error_code,
    'historicalBackfill', json('true')
  ),
  0,
  NULL,
  NULL,
  NULL,
  terminal_event.emitted_at,
  terminal_event.emitted_at,
  NULL,
  1
FROM background_tasks task
JOIN task_flow_tasks link ON link.task_id = task.task_id
JOIN task_flows flow ON flow.flow_id = link.flow_id
JOIN background_task_events terminal_event
  ON terminal_event.task_id = task.task_id
 AND terminal_event.sequence = (
   SELECT MAX(candidate.sequence)
   FROM background_task_events candidate
   WHERE candidate.task_id = task.task_id
     AND candidate.status IN ('SUCCEEDED','FAILED','TIMED_OUT','CANCELLED','LOST')
 )
WHERE task.task_kind = 'task_flow.child'
  AND task.status IN ('SUCCEEDED','FAILED','TIMED_OUT','CANCELLED','LOST')
  AND flow.status IN ('QUEUED','RUNNING','WAITING','BLOCKED')
  AND flow.cancel_requested_at IS NULL
  AND flow.workspace_id = task.workspace_id
  AND flow.owner_key = task.conversation_id;

UPDATE background_tasks
SET delivery_status = 'PENDING',
    terminal_outcome = CASE WHEN status = 'SUCCEEDED' THEN 'BLOCKED' ELSE NULL END,
    terminal_summary = CASE
      WHEN status = 'SUCCEEDED' THEN 'Historical completion requires controller review.'
      ELSE terminal_summary
    END
WHERE task_id IN (
  SELECT task_id
  FROM task_completion_deliveries
  WHERE idempotency_key LIKE 'migration22:%'
);

INSERT INTO background_task_events (
  task_id, sequence, event_type, status, recovery_state,
  payload_json, run_event_sequence, emitted_at
)
SELECT
  delivery.task_id,
  (SELECT COALESCE(MAX(event.sequence), 0) + 1
   FROM background_task_events event
   WHERE event.task_id = delivery.task_id),
  'task.delivery.backfilled',
  task.status,
  task.recovery_state,
  json_object(
    'deliveryId', delivery.delivery_id,
    'terminalOutcome', delivery.terminal_outcome,
    'historicalReview', json('true')
  ),
  NULL,
  delivery.created_at
FROM task_completion_deliveries delivery
JOIN background_tasks task ON task.task_id = delivery.task_id
WHERE delivery.idempotency_key LIKE 'migration22:%';
