ALTER TABLE background_tasks
  ADD COLUMN cleanup_after INTEGER
  CHECK (cleanup_after IS NULL OR cleanup_after >= 0);

ALTER TABLE task_flows
  ADD COLUMN cleanup_after INTEGER
  CHECK (cleanup_after IS NULL OR cleanup_after >= 0);

CREATE INDEX idx_background_tasks_cleanup_after
  ON background_tasks(cleanup_after, task_id)
  WHERE cleanup_after IS NOT NULL;

CREATE INDEX idx_task_flows_cleanup_after
  ON task_flows(cleanup_after, flow_id)
  WHERE cleanup_after IS NOT NULL;
