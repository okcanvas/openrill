CREATE TABLE background_tasks (
  task_id TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  run_id TEXT NOT NULL UNIQUE,
  parent_task_id TEXT,
  runtime TEXT NOT NULL CHECK (runtime IN ('CONVERSATION', 'DELEGATION', 'AUTOMATION')),
  task_kind TEXT NOT NULL CHECK (length(task_kind) BETWEEN 1 AND 128),
  source_id TEXT,
  task_text TEXT NOT NULL CHECK (length(task_text) BETWEEN 1 AND 65536),
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELLED', 'LOST')),
  recovery_state TEXT NOT NULL CHECK (recovery_state IN ('NONE', 'RESUMABLE', 'NON_RESUMABLE')),
  progress_summary TEXT,
  terminal_summary TEXT,
  error_code TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  ended_at INTEGER,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (parent_task_id) REFERENCES background_tasks(task_id) ON DELETE SET NULL
) STRICT;

CREATE INDEX idx_background_tasks_workspace_updated
  ON background_tasks(workspace_id, updated_at DESC, task_id);
CREATE INDEX idx_background_tasks_active
  ON background_tasks(status, updated_at, task_id)
  WHERE status IN ('QUEUED', 'RUNNING');
CREATE INDEX idx_background_tasks_parent
  ON background_tasks(parent_task_id, created_at, task_id)
  WHERE parent_task_id IS NOT NULL;

CREATE TABLE background_task_events (
  task_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 1 AND 128),
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'TIMED_OUT', 'CANCELLED', 'LOST')),
  recovery_state TEXT NOT NULL CHECK (recovery_state IN ('NONE', 'RESUMABLE', 'NON_RESUMABLE')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  run_event_sequence INTEGER,
  emitted_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, sequence),
  FOREIGN KEY (task_id) REFERENCES background_tasks(task_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_background_task_events_time
  ON background_task_events(task_id, emitted_at, sequence);
