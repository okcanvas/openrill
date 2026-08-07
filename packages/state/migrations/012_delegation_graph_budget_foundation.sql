ALTER TABLE run_attempts
  ADD COLUMN max_total_tokens INTEGER
  CHECK (max_total_tokens IS NULL OR max_total_tokens > 0);

ALTER TABLE run_attempts
  ADD COLUMN max_duration_ms INTEGER
  CHECK (max_duration_ms IS NULL OR max_duration_ms > 0);

ALTER TABLE run_attempts
  ADD COLUMN used_turns INTEGER NOT NULL DEFAULT 0
  CHECK (used_turns >= 0);

CREATE TABLE run_budget_envelopes (
  run_id TEXT NOT NULL PRIMARY KEY,
  root_run_id TEXT NOT NULL,
  parent_run_id TEXT,
  depth INTEGER NOT NULL CHECK (depth >= 0),
  max_turns INTEGER NOT NULL CHECK (max_turns > 0),
  max_model_calls INTEGER NOT NULL CHECK (max_model_calls > 0),
  max_tool_calls INTEGER NOT NULL CHECK (max_tool_calls >= 0),
  max_output_tokens INTEGER NOT NULL CHECK (max_output_tokens > 0),
  max_total_tokens INTEGER NOT NULL CHECK (max_total_tokens > 0),
  max_duration_ms INTEGER NOT NULL CHECK (max_duration_ms > 0),
  deadline_at INTEGER NOT NULL CHECK (deadline_at >= 0),
  max_delegation_depth INTEGER NOT NULL CHECK (max_delegation_depth BETWEEN 0 AND 16),
  max_active_children INTEGER NOT NULL CHECK (max_active_children BETWEEN 0 AND 64),
  max_total_children INTEGER NOT NULL CHECK (max_total_children BETWEEN 0 AND 1024),
  allowed_workspace_ids_json TEXT NOT NULL CHECK (json_valid(allowed_workspace_ids_json) AND length(allowed_workspace_ids_json) <= 65536),
  allowed_skill_ids_json TEXT NOT NULL CHECK (json_valid(allowed_skill_ids_json) AND length(allowed_skill_ids_json) <= 65536),
  allowed_tool_names_json TEXT NOT NULL CHECK (json_valid(allowed_tool_names_json) AND length(allowed_tool_names_json) <= 65536),
  used_turns INTEGER NOT NULL DEFAULT 0 CHECK (used_turns >= 0),
  used_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (used_input_tokens >= 0),
  used_output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (used_output_tokens >= 0),
  used_model_calls INTEGER NOT NULL DEFAULT 0 CHECK (used_model_calls >= 0),
  used_tool_calls INTEGER NOT NULL DEFAULT 0 CHECK (used_tool_calls >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (root_run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  CHECK (
    (depth = 0 AND parent_run_id IS NULL AND root_run_id = run_id)
    OR
    (depth > 0 AND parent_run_id IS NOT NULL AND root_run_id != run_id AND parent_run_id != run_id)
  ),
  CHECK (max_total_children >= max_active_children)
) STRICT;

CREATE INDEX idx_run_budget_root_depth
  ON run_budget_envelopes(root_run_id, depth, run_id);
CREATE INDEX idx_run_budget_parent
  ON run_budget_envelopes(parent_run_id, run_id)
  WHERE parent_run_id IS NOT NULL;
CREATE INDEX idx_run_budget_deadline
  ON run_budget_envelopes(deadline_at, run_id);

CREATE TABLE run_delegations (
  delegation_id TEXT NOT NULL PRIMARY KEY,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  root_run_id TEXT NOT NULL,
  parent_run_id TEXT NOT NULL,
  parent_attempt_id TEXT NOT NULL,
  parent_tool_call_id TEXT,
  child_conversation_id TEXT NOT NULL,
  child_run_id TEXT NOT NULL UNIQUE,
  depth INTEGER NOT NULL CHECK (depth BETWEEN 1 AND 16),
  status TEXT NOT NULL CHECK (status IN ('CREATED','RUNNING','WAITING','COMPLETED','FAILED','CANCELLED','TIMED_OUT')),
  task_sha256 TEXT NOT NULL CHECK (length(task_sha256) = 64),
  workspace_scope_json TEXT NOT NULL CHECK (json_valid(workspace_scope_json) AND length(workspace_scope_json) <= 65536),
  skill_ids_json TEXT NOT NULL CHECK (json_valid(skill_ids_json) AND length(skill_ids_json) <= 65536),
  tool_names_json TEXT NOT NULL CHECK (json_valid(tool_names_json) AND length(tool_names_json) <= 65536),
  expected_output TEXT NOT NULL CHECK (expected_output IN ('TEXT','JSON','ARTIFACTS')),
  result_summary_sha256 TEXT CHECK (result_summary_sha256 IS NULL OR length(result_summary_sha256) = 64),
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  ended_at INTEGER,
  updated_at INTEGER NOT NULL,
  UNIQUE (parent_run_id, idempotency_key),
  FOREIGN KEY (root_run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_attempt_id) REFERENCES run_attempts(attempt_id) ON DELETE CASCADE,
  FOREIGN KEY (child_conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (child_run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  CHECK (parent_run_id != child_run_id),
  CHECK (
    (status = 'CREATED' AND started_at IS NULL AND ended_at IS NULL)
    OR (status IN ('RUNNING','WAITING') AND started_at IS NOT NULL AND ended_at IS NULL)
    OR (status IN ('COMPLETED','FAILED','CANCELLED','TIMED_OUT') AND ended_at IS NOT NULL)
  )
) STRICT;

CREATE INDEX idx_run_delegations_parent_status
  ON run_delegations(parent_run_id, status, created_at, delegation_id);
CREATE INDEX idx_run_delegations_root_depth
  ON run_delegations(root_run_id, depth, created_at, delegation_id);
CREATE INDEX idx_run_delegations_child
  ON run_delegations(child_run_id);

CREATE TABLE run_delegation_events (
  delegation_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  event_type TEXT NOT NULL CHECK (event_type IN ('CREATED','STARTED','WAITING','COMPLETED','FAILED','CANCELLED','TIMED_OUT','WAIT_CLEARED')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND length(payload_json) <= 65536),
  emitted_at INTEGER NOT NULL,
  PRIMARY KEY (delegation_id, sequence),
  FOREIGN KEY (delegation_id) REFERENCES run_delegations(delegation_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE run_delegation_waits (
  parent_run_id TEXT NOT NULL,
  delegation_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state = 'WAITING_DELEGATION'),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (parent_run_id, delegation_id),
  FOREIGN KEY (parent_run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (delegation_id) REFERENCES run_delegations(delegation_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_run_delegation_waits_parent
  ON run_delegation_waits(parent_run_id, created_at, delegation_id);
