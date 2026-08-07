ALTER TABLE automation_runs
  ADD COLUMN trigger_kind TEXT NOT NULL DEFAULT 'SCHEDULED'
  CHECK (trigger_kind IN ('SCHEDULED', 'MANUAL'));

ALTER TABLE automation_runs
  ADD COLUMN request_key TEXT
  CHECK (request_key IS NULL OR length(request_key) BETWEEN 1 AND 128);

CREATE UNIQUE INDEX idx_automation_runs_manual_request
  ON automation_runs(request_key)
  WHERE request_key IS NOT NULL;
