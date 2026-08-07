CREATE TABLE automation_jobs (
  job_id TEXT NOT NULL PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 128),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('AT', 'INTERVAL', 'CRON')),
  schedule_payload_json TEXT NOT NULL CHECK (json_valid(schedule_payload_json)),
  timezone TEXT NOT NULL CHECK (length(timezone) BETWEEN 1 AND 128),
  conversation_template_json TEXT NOT NULL CHECK (json_valid(conversation_template_json)),
  catch_up_policy TEXT NOT NULL CHECK (catch_up_policy IN ('SKIP', 'RUN_ONCE', 'BOUNDED')),
  catch_up_limit INTEGER,
  failure_policy_json TEXT NOT NULL CHECK (json_valid(failure_policy_json)),
  revision INTEGER NOT NULL CHECK (revision > 0),
  next_scheduled_for INTEGER CHECK (next_scheduled_for IS NULL OR next_scheduled_for >= 0),
  last_scheduled_for INTEGER CHECK (last_scheduled_for IS NULL OR last_scheduled_for >= 0),
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (
    (catch_up_policy = 'BOUNDED' AND catch_up_limit BETWEEN 1 AND 100)
    OR (catch_up_policy != 'BOUNDED' AND catch_up_limit IS NULL)
  )
) STRICT;

CREATE INDEX idx_automation_jobs_due
  ON automation_jobs(enabled, next_scheduled_for, job_id)
  WHERE enabled = 1 AND next_scheduled_for IS NOT NULL;

CREATE INDEX idx_automation_jobs_updated
  ON automation_jobs(updated_at DESC, job_id);

CREATE TABLE automation_runs (
  automation_run_id TEXT NOT NULL PRIMARY KEY,
  job_id TEXT NOT NULL,
  scheduled_for INTEGER NOT NULL CHECK (scheduled_for >= 0),
  claimed_at INTEGER,
  lease_owner TEXT,
  lease_expires_at INTEGER,
  run_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'CLAIMED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'CANCELLED')),
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (job_id, scheduled_for),
  FOREIGN KEY (job_id) REFERENCES automation_jobs(job_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON DELETE SET NULL,
  CHECK (
    (claimed_at IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL)
    OR (claimed_at IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL AND lease_expires_at >= claimed_at)
  )
) STRICT;

CREATE INDEX idx_automation_runs_job
  ON automation_runs(job_id, scheduled_for DESC, automation_run_id);

CREATE INDEX idx_automation_runs_claimable
  ON automation_runs(status, lease_expires_at, scheduled_for, automation_run_id)
  WHERE status IN ('PENDING', 'CLAIMED');
