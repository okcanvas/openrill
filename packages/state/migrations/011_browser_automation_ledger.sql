CREATE TABLE browser_operations (
  operation_id TEXT NOT NULL PRIMARY KEY,
  run_id TEXT NOT NULL,
  automation_run_id TEXT,
  attempt_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  tool_call_id TEXT,
  tool_name TEXT NOT NULL CHECK (tool_name GLOB 'browser.*' AND length(tool_name) BETWEEN 9 AND 128),
  input_sha256 TEXT NOT NULL CHECK (length(input_sha256) = 64),
  session_id TEXT,
  page_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('STARTED', 'SUCCEEDED', 'FAILED', 'INTERRUPTED')),
  error_code TEXT,
  document_generation INTEGER CHECK (document_generation IS NULL OR document_generation >= 0),
  url TEXT CHECK (url IS NULL OR length(url) <= 8192),
  artifact_id TEXT,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (attempt_id) REFERENCES run_attempts(attempt_id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspace_registrations(workspace_id) ON DELETE CASCADE,
  FOREIGN KEY (automation_run_id) REFERENCES automation_runs(automation_run_id) ON DELETE SET NULL,
  FOREIGN KEY (artifact_id) REFERENCES workspace_artifacts(artifact_id) ON DELETE SET NULL,
  CHECK (
    (status = 'STARTED' AND completed_at IS NULL AND error_code IS NULL)
    OR (status = 'SUCCEEDED' AND completed_at IS NOT NULL AND error_code IS NULL)
    OR (status IN ('FAILED', 'INTERRUPTED') AND completed_at IS NOT NULL AND error_code IS NOT NULL)
  )
) STRICT;

CREATE UNIQUE INDEX idx_browser_operations_tool_call
  ON browser_operations(run_id, tool_call_id)
  WHERE tool_call_id IS NOT NULL;

CREATE INDEX idx_browser_operations_run
  ON browser_operations(run_id, started_at, operation_id);

CREATE INDEX idx_browser_operations_recovery
  ON browser_operations(status, updated_at, operation_id)
  WHERE status = 'STARTED';

CREATE TABLE browser_operation_events (
  operation_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  event_type TEXT NOT NULL CHECK (event_type IN ('STARTED', 'SUCCEEDED', 'FAILED', 'INTERRUPTED')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND length(payload_json) <= 65536),
  emitted_at INTEGER NOT NULL,
  PRIMARY KEY (operation_id, sequence),
  FOREIGN KEY (operation_id) REFERENCES browser_operations(operation_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE browser_evidence_events (
  run_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  operation_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('console', 'page_error', 'network')),
  event_at INTEGER NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND length(payload_json) <= 65536),
  recorded_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, page_id, sequence),
  FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (operation_id) REFERENCES browser_operations(operation_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_browser_evidence_operation
  ON browser_evidence_events(operation_id, sequence);
