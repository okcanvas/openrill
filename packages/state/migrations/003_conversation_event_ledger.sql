CREATE TABLE conversations (
  conversation_id TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  model_profile TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  last_message_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_message_sequence >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE INDEX idx_conversations_workspace_updated
  ON conversations(workspace_id, updated_at DESC, conversation_id);

CREATE TABLE conversation_messages (
  message_id TEXT NOT NULL PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  created_at INTEGER NOT NULL,
  UNIQUE (conversation_id, sequence),
  FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_conversation_messages_order
  ON conversation_messages(conversation_id, sequence);

CREATE TABLE agent_runs (
  run_id TEXT NOT NULL PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  trigger_message_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('CREATED', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED')),
  recovery_state TEXT NOT NULL DEFAULT 'NONE' CHECK (recovery_state IN ('NONE', 'RESUMABLE', 'NON_RESUMABLE')),
  current_attempt_id TEXT,
  last_event_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_event_sequence >= 0),
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  ended_at INTEGER,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (trigger_message_id) REFERENCES conversation_messages(message_id) ON DELETE SET NULL
) STRICT;

CREATE INDEX idx_agent_runs_conversation_created
  ON agent_runs(conversation_id, created_at DESC, run_id);
CREATE INDEX idx_agent_runs_incomplete
  ON agent_runs(status, updated_at, run_id)
  WHERE status IN ('RUNNING', 'WAITING_APPROVAL');

CREATE TABLE run_attempts (
  attempt_id TEXT NOT NULL PRIMARY KEY,
  run_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  status TEXT NOT NULL CHECK (status IN ('CREATED', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED', 'ABORTED')),
  started_at INTEGER,
  ended_at INTEGER,
  recovery_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (run_id, attempt_number),
  FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_run_attempts_run
  ON run_attempts(run_id, attempt_number);

CREATE TABLE run_events (
  run_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  event_id TEXT NOT NULL,
  attempt_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  idempotency_key TEXT,
  emitted_at INTEGER NOT NULL,
  PRIMARY KEY (run_id, sequence),
  UNIQUE (run_id, event_id),
  FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (attempt_id) REFERENCES run_attempts(attempt_id) ON DELETE SET NULL
) STRICT;

CREATE UNIQUE INDEX idx_run_events_idempotency
  ON run_events(run_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_run_events_attempt
  ON run_events(attempt_id, sequence)
  WHERE attempt_id IS NOT NULL;

CREATE TABLE conversation_submissions (
  conversation_id TEXT NOT NULL,
  submission_key TEXT NOT NULL,
  input_hash TEXT NOT NULL CHECK (length(input_hash) = 64),
  message_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (conversation_id, submission_key),
  FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES conversation_messages(message_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE conversation_projections (
  conversation_id TEXT NOT NULL PRIMARY KEY,
  message_count INTEGER NOT NULL CHECK (message_count >= 0),
  last_message_sequence INTEGER NOT NULL CHECK (last_message_sequence >= 0),
  last_run_id TEXT,
  last_run_status TEXT CHECK (last_run_status IS NULL OR last_run_status IN ('CREATED', 'RUNNING', 'WAITING_APPROVAL', 'COMPLETED', 'FAILED', 'CANCELLED')),
  rebuilt_at INTEGER NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (last_run_id) REFERENCES agent_runs(run_id) ON DELETE SET NULL
) STRICT;
