CREATE TABLE state_health_checks (
  check_name TEXT NOT NULL PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('ok', 'warning', 'failed')),
  details_json TEXT NOT NULL CHECK (json_valid(details_json)),
  checked_at INTEGER NOT NULL
) STRICT;

CREATE INDEX idx_state_health_checks_status
  ON state_health_checks(status, checked_at DESC, check_name);
