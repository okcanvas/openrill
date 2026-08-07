CREATE TABLE run_delegation_result_deliveries (
  delegation_id TEXT NOT NULL PRIMARY KEY,
  parent_run_id TEXT NOT NULL,
  parent_attempt_id TEXT NOT NULL,
  parent_tool_call_id TEXT NOT NULL CHECK (length(parent_tool_call_id) BETWEEN 1 AND 128),
  tool_name TEXT NOT NULL CHECK (tool_name = 'agent.wait'),
  status TEXT NOT NULL CHECK (status IN ('PENDING','DELIVERED')),
  result_sha256 TEXT CHECK (result_sha256 IS NULL OR length(result_sha256) = 64),
  created_at INTEGER NOT NULL,
  delivered_at INTEGER,
  updated_at INTEGER NOT NULL,
  UNIQUE (parent_run_id, parent_tool_call_id),
  FOREIGN KEY (delegation_id) REFERENCES run_delegations(delegation_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_attempt_id) REFERENCES run_attempts(attempt_id) ON DELETE CASCADE,
  CHECK (
    (status = 'PENDING' AND delivered_at IS NULL AND result_sha256 IS NULL)
    OR
    (status = 'DELIVERED' AND delivered_at IS NOT NULL AND result_sha256 IS NOT NULL)
  )
) STRICT;

CREATE INDEX idx_run_delegation_result_delivery_parent
  ON run_delegation_result_deliveries(parent_run_id, status, created_at, delegation_id);
