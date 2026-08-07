CREATE TABLE task_flows (
  flow_id TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  controller_id TEXT NOT NULL,
  goal TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('QUEUED','RUNNING','WAITING','BLOCKED','SUCCEEDED','FAILED','CANCELLED','LOST')),
  current_step TEXT,
  blocked_task_id TEXT,
  blocked_summary TEXT,
  state_json TEXT,
  wait_json TEXT,
  cancel_requested_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ended_at INTEGER,
  revision INTEGER NOT NULL CHECK (revision > 0),
  CHECK (length(flow_id) BETWEEN 1 AND 256),
  CHECK (length(workspace_id) BETWEEN 1 AND 64),
  CHECK (length(controller_id) BETWEEN 1 AND 128),
  CHECK (length(goal) BETWEEN 1 AND 65536),
  CHECK (updated_at >= created_at),
  CHECK (ended_at IS NULL OR ended_at >= created_at),
  FOREIGN KEY (blocked_task_id) REFERENCES background_tasks(task_id) ON DELETE SET NULL
) STRICT;

CREATE INDEX idx_task_flows_workspace_updated
  ON task_flows(workspace_id, updated_at DESC, flow_id);
CREATE INDEX idx_task_flows_active
  ON task_flows(status, updated_at, flow_id)
  WHERE status IN ('QUEUED','RUNNING','WAITING','BLOCKED');
CREATE INDEX idx_task_flows_controller
  ON task_flows(workspace_id, controller_id, created_at DESC, flow_id);

CREATE TABLE task_flow_tasks (
  flow_id TEXT NOT NULL,
  task_id TEXT NOT NULL UNIQUE,
  step_key TEXT,
  linked_at INTEGER NOT NULL,
  PRIMARY KEY (flow_id, task_id),
  FOREIGN KEY (flow_id) REFERENCES task_flows(flow_id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES background_tasks(task_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_task_flow_tasks_flow
  ON task_flow_tasks(flow_id, linked_at, task_id);

CREATE TABLE task_flow_events (
  flow_id TEXT NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('QUEUED','RUNNING','WAITING','BLOCKED','SUCCEEDED','FAILED','CANCELLED','LOST')),
  revision INTEGER NOT NULL CHECK (revision > 0),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  emitted_at INTEGER NOT NULL,
  PRIMARY KEY (flow_id, sequence),
  FOREIGN KEY (flow_id) REFERENCES task_flows(flow_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_task_flow_events_time
  ON task_flow_events(flow_id, emitted_at, sequence);
