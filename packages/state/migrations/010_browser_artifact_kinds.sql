CREATE TABLE workspace_artifacts_v10 (
  artifact_id TEXT NOT NULL PRIMARY KEY,
  run_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('READ_OUTPUT', 'SEARCH_OUTPUT', 'FILE_CHANGE', 'BROWSER_SCREENSHOT', 'BROWSER_DOWNLOAD')),
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

INSERT INTO workspace_artifacts_v10
  (artifact_id, run_id, attempt_id, workspace_id, kind, relative_path,
   operation, before_sha256, after_sha256, storage_path, size_bytes, created_at)
SELECT artifact_id, run_id, attempt_id, workspace_id, kind, relative_path,
       operation, before_sha256, after_sha256, storage_path, size_bytes, created_at
FROM workspace_artifacts;

DROP TABLE workspace_artifacts;
ALTER TABLE workspace_artifacts_v10 RENAME TO workspace_artifacts;

CREATE INDEX idx_workspace_artifacts_run
  ON workspace_artifacts(run_id, created_at, artifact_id);

CREATE INDEX idx_workspace_artifacts_workspace
  ON workspace_artifacts(workspace_id, relative_path, created_at);
