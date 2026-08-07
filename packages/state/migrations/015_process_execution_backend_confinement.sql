ALTER TABLE process_records
  ADD COLUMN backend_kind TEXT NOT NULL DEFAULT 'HOST'
  CHECK (backend_kind IN ('HOST','DOCKER'));

ALTER TABLE process_records
  ADD COLUMN backend_handle_id TEXT;

ALTER TABLE process_records
  ADD COLUMN sandboxed INTEGER NOT NULL DEFAULT 0
  CHECK (sandboxed IN (0,1));

ALTER TABLE process_records
  ADD COLUMN confinement_json TEXT
  CHECK (confinement_json IS NULL OR json_valid(confinement_json));

CREATE INDEX idx_process_records_backend
  ON process_records(backend_kind, status, updated_at, process_id);
