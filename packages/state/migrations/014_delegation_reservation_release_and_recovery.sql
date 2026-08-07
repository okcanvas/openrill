ALTER TABLE run_budget_envelopes
  ADD COLUMN delegated_used_turns INTEGER NOT NULL DEFAULT 0 CHECK (delegated_used_turns >= 0);
ALTER TABLE run_budget_envelopes
  ADD COLUMN delegated_used_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (delegated_used_input_tokens >= 0);
ALTER TABLE run_budget_envelopes
  ADD COLUMN delegated_used_output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (delegated_used_output_tokens >= 0);
ALTER TABLE run_budget_envelopes
  ADD COLUMN delegated_used_model_calls INTEGER NOT NULL DEFAULT 0 CHECK (delegated_used_model_calls >= 0);
ALTER TABLE run_budget_envelopes
  ADD COLUMN delegated_used_tool_calls INTEGER NOT NULL DEFAULT 0 CHECK (delegated_used_tool_calls >= 0);

CREATE TABLE run_delegation_budget_reservations (
  delegation_id TEXT NOT NULL PRIMARY KEY,
  parent_run_id TEXT NOT NULL,
  child_run_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('RESERVED','RELEASED')),
  reserved_turns INTEGER NOT NULL CHECK (reserved_turns >= 0),
  reserved_model_calls INTEGER NOT NULL CHECK (reserved_model_calls >= 0),
  reserved_tool_calls INTEGER NOT NULL CHECK (reserved_tool_calls >= 0),
  reserved_total_tokens INTEGER NOT NULL CHECK (reserved_total_tokens >= 0),
  charged_turns INTEGER NOT NULL DEFAULT 0 CHECK (charged_turns >= 0),
  charged_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (charged_input_tokens >= 0),
  charged_output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (charged_output_tokens >= 0),
  charged_model_calls INTEGER NOT NULL DEFAULT 0 CHECK (charged_model_calls >= 0),
  charged_tool_calls INTEGER NOT NULL DEFAULT 0 CHECK (charged_tool_calls >= 0),
  release_reason TEXT CHECK (release_reason IS NULL OR release_reason IN ('COMPLETED','FAILED','CANCELLED','TIMED_OUT')),
  created_at INTEGER NOT NULL,
  released_at INTEGER,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (delegation_id) REFERENCES run_delegations(delegation_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (child_run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  CHECK (
    (status = 'RESERVED' AND release_reason IS NULL AND released_at IS NULL
      AND charged_turns = 0 AND charged_input_tokens = 0 AND charged_output_tokens = 0
      AND charged_model_calls = 0 AND charged_tool_calls = 0)
    OR
    (status = 'RELEASED' AND release_reason IS NOT NULL AND released_at IS NOT NULL)
  )
) STRICT;

CREATE INDEX idx_run_delegation_reservations_parent_status
  ON run_delegation_budget_reservations(parent_run_id, status, created_at, delegation_id);

-- Backfill any delegation rows created under schema 13. Active rows retain their
-- full reservation. Terminal rows are released and charge the child Run's
-- observed usage, including usage already delegated to descendants.
INSERT INTO run_delegation_budget_reservations (
  delegation_id,parent_run_id,child_run_id,status,
  reserved_turns,reserved_model_calls,reserved_tool_calls,reserved_total_tokens,
  charged_turns,charged_input_tokens,charged_output_tokens,charged_model_calls,charged_tool_calls,
  release_reason,created_at,released_at,updated_at
)
SELECT
  d.delegation_id,d.parent_run_id,d.child_run_id,
  CASE WHEN d.status IN ('CREATED','RUNNING','WAITING') THEN 'RESERVED' ELSE 'RELEASED' END,
  b.max_turns,b.max_model_calls,b.max_tool_calls,b.max_total_tokens,
  CASE WHEN d.status IN ('CREATED','RUNNING','WAITING') THEN 0 ELSE b.used_turns + b.delegated_used_turns END,
  CASE WHEN d.status IN ('CREATED','RUNNING','WAITING') THEN 0 ELSE b.used_input_tokens + b.delegated_used_input_tokens END,
  CASE WHEN d.status IN ('CREATED','RUNNING','WAITING') THEN 0 ELSE b.used_output_tokens + b.delegated_used_output_tokens END,
  CASE WHEN d.status IN ('CREATED','RUNNING','WAITING') THEN 0 ELSE b.used_model_calls + b.delegated_used_model_calls END,
  CASE WHEN d.status IN ('CREATED','RUNNING','WAITING') THEN 0 ELSE b.used_tool_calls + b.delegated_used_tool_calls END,
  CASE WHEN d.status IN ('CREATED','RUNNING','WAITING') THEN NULL ELSE d.status END,
  d.created_at,
  CASE WHEN d.status IN ('CREATED','RUNNING','WAITING') THEN NULL ELSE COALESCE(d.ended_at,d.updated_at) END,
  d.updated_at
FROM run_delegations d
JOIN run_budget_envelopes b ON b.run_id=d.child_run_id;

UPDATE run_budget_envelopes AS parent
SET
  delegated_used_turns = COALESCE((
    SELECT SUM(r.charged_turns) FROM run_delegation_budget_reservations r
    WHERE r.parent_run_id=parent.run_id AND r.status='RELEASED'
  ),0),
  delegated_used_input_tokens = COALESCE((
    SELECT SUM(r.charged_input_tokens) FROM run_delegation_budget_reservations r
    WHERE r.parent_run_id=parent.run_id AND r.status='RELEASED'
  ),0),
  delegated_used_output_tokens = COALESCE((
    SELECT SUM(r.charged_output_tokens) FROM run_delegation_budget_reservations r
    WHERE r.parent_run_id=parent.run_id AND r.status='RELEASED'
  ),0),
  delegated_used_model_calls = COALESCE((
    SELECT SUM(r.charged_model_calls) FROM run_delegation_budget_reservations r
    WHERE r.parent_run_id=parent.run_id AND r.status='RELEASED'
  ),0),
  delegated_used_tool_calls = COALESCE((
    SELECT SUM(r.charged_tool_calls) FROM run_delegation_budget_reservations r
    WHERE r.parent_run_id=parent.run_id AND r.status='RELEASED'
  ),0),
  updated_at = MAX(updated_at, COALESCE((
    SELECT MAX(r.updated_at) FROM run_delegation_budget_reservations r
    WHERE r.parent_run_id=parent.run_id AND r.status='RELEASED'
  ),updated_at));
