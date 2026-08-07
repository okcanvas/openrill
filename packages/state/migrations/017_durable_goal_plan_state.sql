CREATE TABLE agent_goals (
  goal_id TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  objective TEXT NOT NULL CHECK (length(objective) BETWEEN 1 AND 4000),
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PAUSED', 'BLOCKED', 'COMPLETED', 'CANCELLED')),
  last_note TEXT,
  blocker_fingerprint TEXT,
  consecutive_blocker_count INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_blocker_count >= 0),
  continuation_count INTEGER NOT NULL DEFAULT 0 CHECK (continuation_count >= 0),
  plan_revision INTEGER NOT NULL DEFAULT 1 CHECK (plan_revision > 0),
  source_run_id TEXT,
  source_attempt_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  terminal_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (source_run_id) REFERENCES agent_runs(run_id) ON DELETE SET NULL,
  FOREIGN KEY (source_attempt_id) REFERENCES run_attempts(attempt_id) ON DELETE SET NULL
) STRICT;

CREATE UNIQUE INDEX idx_agent_goals_one_open_per_conversation
  ON agent_goals(conversation_id)
  WHERE status IN ('ACTIVE', 'PAUSED', 'BLOCKED');

CREATE INDEX idx_agent_goals_workspace_updated
  ON agent_goals(workspace_id, updated_at DESC, goal_id);

CREATE TABLE agent_goal_plan_steps (
  step_id TEXT NOT NULL PRIMARY KEY,
  goal_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 1000),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED')),
  note TEXT,
  source_run_id TEXT,
  source_attempt_id TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  UNIQUE (goal_id, ordinal),
  FOREIGN KEY (goal_id) REFERENCES agent_goals(goal_id) ON DELETE CASCADE,
  FOREIGN KEY (source_run_id) REFERENCES agent_runs(run_id) ON DELETE SET NULL,
  FOREIGN KEY (source_attempt_id) REFERENCES run_attempts(attempt_id) ON DELETE SET NULL
) STRICT;

CREATE INDEX idx_agent_goal_plan_steps_order
  ON agent_goal_plan_steps(goal_id, ordinal);

CREATE TABLE agent_goal_events (
  goal_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  source_run_id TEXT,
  source_attempt_id TEXT,
  emitted_at INTEGER NOT NULL,
  PRIMARY KEY (goal_id, sequence),
  FOREIGN KEY (goal_id) REFERENCES agent_goals(goal_id) ON DELETE CASCADE,
  FOREIGN KEY (source_run_id) REFERENCES agent_runs(run_id) ON DELETE SET NULL,
  FOREIGN KEY (source_attempt_id) REFERENCES run_attempts(attempt_id) ON DELETE SET NULL
) STRICT;

CREATE INDEX idx_agent_goal_events_time
  ON agent_goal_events(goal_id, emitted_at, sequence);
