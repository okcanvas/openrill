ALTER TABLE task_flows ADD COLUMN owner_key TEXT;

UPDATE task_flows
SET owner_key = CASE
  WHEN (
    SELECT COUNT(DISTINCT background_tasks.conversation_id)
    FROM task_flow_tasks
    JOIN background_tasks ON background_tasks.task_id = task_flow_tasks.task_id
    WHERE task_flow_tasks.flow_id = task_flows.flow_id
  ) = 1 THEN (
    SELECT MIN(background_tasks.conversation_id)
    FROM task_flow_tasks
    JOIN background_tasks ON background_tasks.task_id = task_flow_tasks.task_id
    WHERE task_flow_tasks.flow_id = task_flows.flow_id
  )
  ELSE 'legacy:' || substr(flow_id, 1, 249)
END;

CREATE INDEX idx_task_flows_owner_updated
  ON task_flows(workspace_id, owner_key, updated_at DESC, flow_id);

CREATE TRIGGER task_flows_owner_required_insert
BEFORE INSERT ON task_flows
WHEN NEW.owner_key IS NULL OR length(NEW.owner_key) NOT BETWEEN 1 AND 256
BEGIN
  SELECT RAISE(ABORT, 'task_flows.owner_key is required');
END;

CREATE TRIGGER task_flows_owner_required_update
BEFORE UPDATE OF owner_key ON task_flows
WHEN NEW.owner_key IS NULL OR length(NEW.owner_key) NOT BETWEEN 1 AND 256
BEGIN
  SELECT RAISE(ABORT, 'task_flows.owner_key is required');
END;
