CREATE TABLE tool_calls (
  tool_execution_id TEXT NOT NULL PRIMARY KEY,
  run_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  input_json TEXT NOT NULL CHECK (json_valid(input_json)),
  input_hash TEXT NOT NULL CHECK (length(input_hash) = 64),
  schema_hash TEXT NOT NULL CHECK (length(schema_hash) = 64),
  binding_digest TEXT NOT NULL CHECK (length(binding_digest) = 64),
  status TEXT NOT NULL CHECK (status IN ('PENDING_APPROVAL','APPROVED','RUNNING','COMPLETED','FAILED','DENIED','CANCELLED')),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (run_id, tool_call_id),
  FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (attempt_id) REFERENCES run_attempts(attempt_id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspace_registrations(workspace_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX idx_tool_calls_run ON tool_calls(run_id, created_at, tool_execution_id);
CREATE INDEX idx_tool_calls_status ON tool_calls(status, updated_at, tool_execution_id);

CREATE TABLE approval_requests (
  request_id TEXT NOT NULL PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  tool_execution_id TEXT NOT NULL UNIQUE,
  run_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  binding_digest TEXT NOT NULL CHECK (length(binding_digest) = 64),
  policy_fingerprint TEXT NOT NULL CHECK (length(policy_fingerprint) = 64),
  status TEXT NOT NULL CHECK (status IN ('PENDING','APPROVED','DENIED','EXPIRED','CONSUMED','CANCELLED')),
  decision TEXT CHECK (decision IS NULL OR decision IN ('allow_once','allow_for_conversation','deny')),
  summary_json TEXT NOT NULL CHECK (json_valid(summary_json)),
  continuation_json TEXT NOT NULL CHECK (json_valid(continuation_json)),
  expires_at INTEGER NOT NULL,
  resolved_at INTEGER,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (tool_execution_id) REFERENCES tool_calls(tool_execution_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (attempt_id) REFERENCES run_attempts(attempt_id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspace_registrations(workspace_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX idx_approval_requests_status ON approval_requests(status, expires_at, request_id);
CREATE INDEX idx_approval_requests_run ON approval_requests(run_id, created_at, request_id);

CREATE TABLE approval_conversation_grants (
  conversation_id TEXT NOT NULL,
  policy_fingerprint TEXT NOT NULL CHECK (length(policy_fingerprint) = 64),
  created_from_request_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, policy_fingerprint),
  FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (created_from_request_id) REFERENCES approval_requests(request_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE process_records (
  process_id TEXT NOT NULL PRIMARY KEY,
  tool_execution_id TEXT NOT NULL UNIQUE,
  run_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('FOREGROUND','BACKGROUND')),
  command_kind TEXT NOT NULL CHECK (command_kind IN ('ARGV','SHELL')),
  command_display TEXT NOT NULL,
  cwd_relative TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('STARTING','RUNNING','EXITED','FAILED_TO_START','CANCELLED','ORPHANED')),
  pid INTEGER,
  stdout_path TEXT NOT NULL,
  stderr_path TEXT NOT NULL,
  exit_code INTEGER,
  exit_signal TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (tool_execution_id) REFERENCES tool_calls(tool_execution_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (attempt_id) REFERENCES run_attempts(attempt_id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspace_registrations(workspace_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX idx_process_records_run ON process_records(run_id, updated_at, process_id);
CREATE INDEX idx_process_records_active ON process_records(status, updated_at, process_id)
  WHERE status IN ('STARTING','RUNNING');
