ALTER TABLE connector_deliveries
  ADD COLUMN cleanup_after INTEGER
  CHECK (cleanup_after IS NULL OR cleanup_after >= 0);

CREATE INDEX idx_connector_deliveries_cleanup_after
  ON connector_deliveries(cleanup_after, delivery_id)
  WHERE cleanup_after IS NOT NULL;

CREATE TABLE maintenance_leases (
  scope_key TEXT NOT NULL PRIMARY KEY CHECK (length(scope_key) BETWEEN 1 AND 256),
  owner_id TEXT NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 256),
  lease_token TEXT NOT NULL UNIQUE CHECK (length(lease_token) BETWEEN 1 AND 256),
  lease_expires_at INTEGER NOT NULL CHECK (lease_expires_at >= 0),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
) STRICT;

CREATE INDEX idx_maintenance_leases_expiry
  ON maintenance_leases(lease_expires_at, scope_key);

CREATE TABLE maintenance_sweep_state (
  scope_key TEXT NOT NULL PRIMARY KEY CHECK (length(scope_key) BETWEEN 1 AND 256),
  cursor_cleanup_after INTEGER CHECK (cursor_cleanup_after IS NULL OR cursor_cleanup_after >= 0),
  cursor_entity_kind TEXT CHECK (cursor_entity_kind IS NULL OR cursor_entity_kind IN ('TASK','TASK_FLOW','CONNECTOR_DELIVERY')),
  cursor_entity_id TEXT CHECK (cursor_entity_id IS NULL OR length(cursor_entity_id) BETWEEN 1 AND 512),
  updated_at INTEGER NOT NULL CHECK (updated_at >= 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  CHECK (
    (cursor_cleanup_after IS NULL AND cursor_entity_kind IS NULL AND cursor_entity_id IS NULL)
    OR
    (cursor_cleanup_after IS NOT NULL AND cursor_entity_kind IS NOT NULL AND cursor_entity_id IS NOT NULL)
  )
) STRICT;

CREATE TABLE maintenance_retention_tombstones (
  entity_kind TEXT NOT NULL CHECK (entity_kind IN ('TASK','TASK_FLOW','CONNECTOR_DELIVERY')),
  entity_id TEXT NOT NULL CHECK (length(entity_id) BETWEEN 1 AND 512),
  workspace_id TEXT NOT NULL CHECK (length(workspace_id) BETWEEN 1 AND 64),
  terminal_status TEXT NOT NULL CHECK (length(terminal_status) BETWEEN 1 AND 64),
  source_ref TEXT CHECK (source_ref IS NULL OR length(source_ref) BETWEEN 1 AND 512),
  terminal_at INTEGER NOT NULL CHECK (terminal_at >= 0),
  cleanup_after INTEGER NOT NULL CHECK (cleanup_after >= 0),
  pruned_at INTEGER NOT NULL CHECK (pruned_at >= cleanup_after),
  metadata_hash TEXT NOT NULL CHECK (length(metadata_hash) = 64),
  PRIMARY KEY (entity_kind, entity_id)
) STRICT;

CREATE INDEX idx_maintenance_retention_tombstones_workspace
  ON maintenance_retention_tombstones(workspace_id, pruned_at DESC, entity_kind, entity_id);
