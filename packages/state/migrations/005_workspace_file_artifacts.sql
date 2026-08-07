CREATE TABLE workspace_registrations (
  workspace_id TEXT NOT NULL PRIMARY KEY,
  display_name TEXT NOT NULL,
  canonical_root TEXT NOT NULL UNIQUE,
  root_revision TEXT NOT NULL CHECK (length(root_revision) = 64),
  access_mode TEXT NOT NULL CHECK (access_mode IN ('READ_ONLY', 'READ_WRITE')),
  trust_state TEXT NOT NULL CHECK (trust_state = 'CONFIGURED_LOCAL'),
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE workspace_artifacts (
  artifact_id TEXT NOT NULL PRIMARY KEY,
  run_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('READ_OUTPUT', 'SEARCH_OUTPUT', 'FILE_CHANGE')),
  relative_path TEXT,
  operation TEXT NOT NULL,
  before_sha256 TEXT,
  after_sha256 TEXT,
  storage_path TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (attempt_id) REFERENCES run_attempts(attempt_id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspace_registrations(workspace_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX idx_workspace_artifacts_run
  ON workspace_artifacts(run_id, created_at, artifact_id);

CREATE INDEX idx_workspace_artifacts_workspace
  ON workspace_artifacts(workspace_id, relative_path, created_at);
