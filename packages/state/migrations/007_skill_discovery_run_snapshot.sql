CREATE TABLE skill_sources (
  source_key TEXT NOT NULL PRIMARY KEY CHECK (length(source_key) = 64),
  source_type TEXT NOT NULL CHECK (source_type IN ('BUNDLED','MANAGED_USER','WORKSPACE')),
  workspace_id TEXT,
  root_path TEXT NOT NULL,
  root_revision TEXT NOT NULL CHECK (length(root_revision) = 64),
  discovered_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_registrations(workspace_id) ON DELETE CASCADE,
  UNIQUE (source_type, workspace_id, root_path)
) STRICT;

CREATE TABLE skill_validation_diagnostics (
  diagnostic_id TEXT NOT NULL PRIMARY KEY CHECK (length(diagnostic_id) = 64),
  source_key TEXT NOT NULL,
  skill_id TEXT,
  code TEXT NOT NULL,
  path TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (source_key) REFERENCES skill_sources(source_key) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_skill_diagnostics_source ON skill_validation_diagnostics(source_key, created_at, diagnostic_id);


CREATE TABLE skill_run_contexts (
  run_id TEXT NOT NULL PRIMARY KEY,
  catalog_hash TEXT NOT NULL CHECK (length(catalog_hash) = 64),
  selected_skill_ids_json TEXT NOT NULL CHECK (json_valid(selected_skill_ids_json)),
  resolved_at INTEGER NOT NULL,
  FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE skill_snapshots (
  snapshot_id TEXT NOT NULL PRIMARY KEY CHECK (length(snapshot_id) = 64),
  run_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  skill_version TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  storage_path TEXT NOT NULL,
  manifest_json TEXT NOT NULL CHECK (json_valid(manifest_json)),
  resolved_files_json TEXT NOT NULL CHECK (json_valid(resolved_files_json)),
  captured_at INTEGER NOT NULL,
  UNIQUE (run_id, skill_id),
  FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON DELETE CASCADE,
  FOREIGN KEY (source_key) REFERENCES skill_sources(source_key) ON DELETE RESTRICT
) STRICT;

CREATE INDEX idx_skill_snapshots_run ON skill_snapshots(run_id, skill_id);
CREATE INDEX idx_skill_snapshots_source ON skill_snapshots(source_key, captured_at, snapshot_id);
