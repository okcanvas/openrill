ALTER TABLE run_attempts ADD COLUMN provider_id TEXT;
ALTER TABLE run_attempts ADD COLUMN model_id TEXT;
ALTER TABLE run_attempts ADD COLUMN max_turns INTEGER CHECK (max_turns IS NULL OR max_turns > 0);
ALTER TABLE run_attempts ADD COLUMN max_model_calls INTEGER CHECK (max_model_calls IS NULL OR max_model_calls > 0);
ALTER TABLE run_attempts ADD COLUMN max_tool_calls INTEGER CHECK (max_tool_calls IS NULL OR max_tool_calls >= 0);
ALTER TABLE run_attempts ADD COLUMN max_output_tokens INTEGER CHECK (max_output_tokens IS NULL OR max_output_tokens > 0);
ALTER TABLE run_attempts ADD COLUMN used_input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (used_input_tokens >= 0);
ALTER TABLE run_attempts ADD COLUMN used_output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (used_output_tokens >= 0);
ALTER TABLE run_attempts ADD COLUMN model_call_count INTEGER NOT NULL DEFAULT 0 CHECK (model_call_count >= 0);
ALTER TABLE run_attempts ADD COLUMN tool_call_count INTEGER NOT NULL DEFAULT 0 CHECK (tool_call_count >= 0);
ALTER TABLE run_attempts ADD COLUMN terminal_reason TEXT;

CREATE TABLE model_invocations (
  invocation_id TEXT NOT NULL PRIMARY KEY,
  run_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  turn_number INTEGER NOT NULL CHECK (turn_number > 0),
  request_number INTEGER NOT NULL CHECK (request_number > 0),
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('STARTED', 'COMPLETED', 'FAILED', 'CANCELLED')),
  provider_response_id TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens INTEGER NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  error_code TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  UNIQUE (run_id, request_number),
  FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (attempt_id) REFERENCES run_attempts(attempt_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_model_invocations_attempt
  ON model_invocations(attempt_id, request_number);
