CREATE TABLE agent_goal_plan_revision_steps (
  goal_id TEXT NOT NULL,
  plan_revision INTEGER NOT NULL CHECK (plan_revision > 0),
  step_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 1000),
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0, 1)),
  retry_mode TEXT NOT NULL DEFAULT 'MANUAL' CHECK (retry_mode IN ('MANUAL')),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 20),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (goal_id, plan_revision, step_id),
  UNIQUE (goal_id, plan_revision, ordinal),
  FOREIGN KEY (goal_id) REFERENCES agent_goals(goal_id) ON DELETE CASCADE,
  FOREIGN KEY (step_id) REFERENCES agent_goal_plan_steps(step_id) ON DELETE RESTRICT
) STRICT;

INSERT INTO agent_goal_plan_revision_steps
  (goal_id, plan_revision, step_id, ordinal, title, required, retry_mode, max_attempts, created_at)
SELECT g.goal_id, g.plan_revision, s.step_id, s.ordinal, s.title, 1, 'MANUAL', 3, g.updated_at
FROM agent_goals g
JOIN agent_goal_plan_steps s ON s.goal_id = g.goal_id;

CREATE INDEX idx_agent_goal_plan_revision_steps_order
  ON agent_goal_plan_revision_steps(goal_id, plan_revision, ordinal);

ALTER TABLE agent_goal_step_executions
  ADD COLUMN retry_mode TEXT NOT NULL DEFAULT 'MANUAL' CHECK (retry_mode IN ('MANUAL'));
ALTER TABLE agent_goal_step_executions
  ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 20);
ALTER TABLE agent_goal_step_executions
  ADD COLUMN next_retry_at INTEGER;
ALTER TABLE agent_goal_step_executions
  ADD COLUMN last_retry_reason TEXT;

CREATE TABLE agent_goal_step_blockers (
  blocker_id TEXT NOT NULL PRIMARY KEY,
  goal_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  plan_revision INTEGER NOT NULL CHECK (plan_revision > 0),
  task_id TEXT,
  blocker_type TEXT NOT NULL CHECK (blocker_type IN ('TASK_OUTPUT', 'TASK_FAILURE', 'OPERATOR', 'DEPENDENCY', 'RETRY_LIMIT')),
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 2000),
  evidence_json TEXT NOT NULL CHECK (json_valid(evidence_json)),
  status TEXT NOT NULL CHECK (status IN ('OPEN', 'RESOLVED')),
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolved_by TEXT,
  resolution TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  UNIQUE (goal_id, step_id, plan_revision, fingerprint),
  FOREIGN KEY (goal_id, step_id, plan_revision)
    REFERENCES agent_goal_step_executions(goal_id, step_id, plan_revision) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES background_tasks(task_id) ON DELETE SET NULL
) STRICT;

CREATE INDEX idx_agent_goal_step_blockers_open
  ON agent_goal_step_blockers(goal_id, plan_revision, step_id, status, updated_at);

INSERT INTO agent_goal_step_blockers
  (blocker_id, goal_id, step_id, plan_revision, task_id, blocker_type, fingerprint,
   summary, evidence_json, status, occurrence_count, created_at, updated_at,
   resolved_at, resolved_by, resolution, revision)
SELECT
  'blocker:migrated:' || hex(randomblob(16)),
  e.goal_id,
  e.step_id,
  e.plan_revision,
  e.current_task_id,
  CASE WHEN e.status = 'FAILED' THEN 'TASK_FAILURE' ELSE 'TASK_OUTPUT' END,
  printf('%064x', e.rowid),
  COALESCE(NULLIF(e.last_summary, ''), 'Historical blocked Goal Step requires explicit review.'),
  json_object('migration', 24, 'status', e.status, 'taskId', e.current_task_id),
  'OPEN',
  1,
  e.updated_at,
  e.updated_at,
  NULL,
  NULL,
  NULL,
  1
FROM agent_goal_step_executions e
WHERE e.status IN ('BLOCKED', 'FAILED');

ALTER TABLE task_completion_deliveries ADD COLUMN controller_execution_revision INTEGER;
ALTER TABLE task_completion_deliveries ADD COLUMN controller_step_revision INTEGER;
ALTER TABLE task_completion_deliveries ADD COLUMN controller_flow_revision INTEGER;
