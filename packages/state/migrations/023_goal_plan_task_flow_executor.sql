CREATE TABLE agent_goal_executions (
  goal_id TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  plan_revision INTEGER NOT NULL CHECK (plan_revision > 0),
  flow_id TEXT NOT NULL UNIQUE,
  controller_id TEXT NOT NULL CHECK (length(controller_id) BETWEEN 1 AND 128),
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'WAITING', 'BLOCKED', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  current_step_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ended_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  FOREIGN KEY (goal_id) REFERENCES agent_goals(goal_id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (flow_id) REFERENCES task_flows(flow_id) ON DELETE RESTRICT,
  FOREIGN KEY (current_step_id) REFERENCES agent_goal_plan_steps(step_id) ON DELETE SET NULL
) STRICT;

CREATE INDEX idx_agent_goal_executions_workspace_status
  ON agent_goal_executions(workspace_id, status, updated_at, goal_id);

CREATE TABLE agent_goal_step_executions (
  goal_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  plan_revision INTEGER NOT NULL CHECK (plan_revision > 0),
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'READY', 'RUNNING', 'WAITING', 'BLOCKED', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'SKIPPED')),
  current_task_id TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_terminal_outcome TEXT CHECK (last_terminal_outcome IS NULL OR last_terminal_outcome IN ('SUCCEEDED', 'BLOCKED')),
  last_summary TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  PRIMARY KEY (goal_id, step_id, plan_revision),
  UNIQUE (current_task_id),
  FOREIGN KEY (goal_id) REFERENCES agent_goal_executions(goal_id) ON DELETE CASCADE,
  FOREIGN KEY (step_id) REFERENCES agent_goal_plan_steps(step_id) ON DELETE CASCADE,
  FOREIGN KEY (current_task_id) REFERENCES background_tasks(task_id) ON DELETE SET NULL
) STRICT;

CREATE INDEX idx_agent_goal_step_executions_order
  ON agent_goal_step_executions(goal_id, plan_revision, ordinal);

CREATE UNIQUE INDEX idx_agent_goal_step_executions_single_active
  ON agent_goal_step_executions(goal_id, plan_revision)
  WHERE status IN ('RUNNING', 'WAITING', 'BLOCKED');
