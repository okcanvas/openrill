CREATE TABLE connector_accounts (
  connector_id TEXT NOT NULL CHECK (length(connector_id) BETWEEN 1 AND 128),
  account_id TEXT NOT NULL CHECK (length(account_id) BETWEEN 1 AND 128),
  workspace_id TEXT NOT NULL,
  extension_id TEXT NOT NULL CHECK (length(extension_id) BETWEEN 1 AND 128),
  status TEXT NOT NULL CHECK (status IN ('ENABLED', 'DISABLED')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (connector_id, account_id)
) STRICT;

CREATE INDEX idx_connector_accounts_workspace
  ON connector_accounts(workspace_id, connector_id, account_id);

CREATE TABLE connector_conversation_bindings (
  binding_id TEXT NOT NULL PRIMARY KEY,
  connector_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  external_scope_id TEXT NOT NULL CHECK (length(external_scope_id) BETWEEN 1 AND 256),
  external_conversation_id TEXT NOT NULL CHECK (length(external_conversation_id) BETWEEN 1 AND 256),
  external_thread_id TEXT NOT NULL DEFAULT '' CHECK (length(external_thread_id) <= 256),
  conversation_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (connector_id, account_id, external_scope_id, external_conversation_id, external_thread_id),
  FOREIGN KEY (connector_id, account_id) REFERENCES connector_accounts(connector_id, account_id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_connector_bindings_conversation
  ON connector_conversation_bindings(conversation_id, connector_id, account_id);

CREATE TABLE connector_ingress_events (
  ingress_id TEXT NOT NULL PRIMARY KEY,
  connector_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  external_event_id TEXT NOT NULL CHECK (length(external_event_id) BETWEEN 1 AND 256),
  lane_key TEXT NOT NULL CHECK (length(lane_key) BETWEEN 1 AND 512),
  payload_version INTEGER NOT NULL CHECK (payload_version > 0),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('RECEIVED', 'CLAIMED', 'ADOPTED', 'IGNORED', 'DEAD')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at INTEGER NOT NULL,
  claim_token TEXT,
  claim_deadline_at INTEGER,
  binding_id TEXT,
  message_id TEXT,
  run_id TEXT,
  last_error_code TEXT,
  last_error_summary TEXT,
  received_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (connector_id, account_id, external_event_id),
  CHECK ((status = 'CLAIMED') = (claim_token IS NOT NULL AND claim_deadline_at IS NOT NULL)),
  FOREIGN KEY (connector_id, account_id) REFERENCES connector_accounts(connector_id, account_id) ON DELETE CASCADE,
  FOREIGN KEY (binding_id) REFERENCES connector_conversation_bindings(binding_id) ON DELETE SET NULL,
  FOREIGN KEY (message_id) REFERENCES conversation_messages(message_id) ON DELETE SET NULL,
  FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON DELETE SET NULL
) STRICT;

CREATE INDEX idx_connector_ingress_due
  ON connector_ingress_events(connector_id, account_id, status, available_at, received_at, ingress_id);
CREATE INDEX idx_connector_ingress_claim_deadline
  ON connector_ingress_events(status, claim_deadline_at);

CREATE TABLE connector_deliveries (
  delivery_id TEXT NOT NULL PRIMARY KEY,
  connector_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  run_id TEXT,
  source_message_id TEXT,
  target_key TEXT NOT NULL CHECK (length(target_key) BETWEEN 1 AND 512),
  thread_key TEXT NOT NULL DEFAULT '' CHECK (length(thread_key) <= 256),
  payload_version INTEGER NOT NULL CHECK (payload_version > 0),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 256),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'DELIVERING', 'DELIVERED', 'SUPPRESSED', 'UNCERTAIN', 'DEAD')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  available_at INTEGER NOT NULL,
  claim_token TEXT,
  claim_deadline_at INTEGER,
  last_error_code TEXT,
  last_error_summary TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (connector_id, account_id, idempotency_key),
  CHECK ((status = 'DELIVERING') = (claim_token IS NOT NULL AND claim_deadline_at IS NOT NULL)),
  FOREIGN KEY (connector_id, account_id) REFERENCES connector_accounts(connector_id, account_id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES agent_runs(run_id) ON DELETE SET NULL,
  FOREIGN KEY (source_message_id) REFERENCES conversation_messages(message_id) ON DELETE SET NULL
) STRICT;

CREATE INDEX idx_connector_delivery_due
  ON connector_deliveries(connector_id, account_id, status, available_at, created_at, delivery_id);
CREATE INDEX idx_connector_delivery_claim_deadline
  ON connector_deliveries(status, claim_deadline_at);

CREATE TABLE connector_delivery_attempts (
  attempt_id TEXT NOT NULL PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  claim_token TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  status TEXT NOT NULL CHECK (status IN ('CLAIMED', 'DISPATCHED', 'ACCEPTED', 'REJECTED', 'ABANDONED', 'UNCERTAIN')),
  error_code TEXT,
  error_summary TEXT,
  started_at INTEGER NOT NULL,
  dispatched_at INTEGER,
  ended_at INTEGER,
  UNIQUE (delivery_id, attempt_number),
  FOREIGN KEY (delivery_id) REFERENCES connector_deliveries(delivery_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_connector_delivery_attempts_delivery
  ON connector_delivery_attempts(delivery_id, attempt_number);

CREATE TABLE connector_delivery_receipts (
  receipt_id TEXT NOT NULL PRIMARY KEY,
  delivery_id TEXT NOT NULL,
  attempt_id TEXT NOT NULL UNIQUE,
  provider_message_id TEXT NOT NULL CHECK (length(provider_message_id) BETWEEN 1 AND 512),
  provider_conversation_id TEXT,
  provider_thread_id TEXT,
  receipt_json TEXT NOT NULL CHECK (json_valid(receipt_json)),
  receipt_hash TEXT NOT NULL CHECK (length(receipt_hash) = 64),
  accepted_at INTEGER NOT NULL,
  UNIQUE (delivery_id, provider_message_id),
  FOREIGN KEY (delivery_id) REFERENCES connector_deliveries(delivery_id) ON DELETE CASCADE,
  FOREIGN KEY (attempt_id) REFERENCES connector_delivery_attempts(attempt_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE connector_dead_letters (
  dead_letter_id TEXT NOT NULL PRIMARY KEY,
  connector_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('INGRESS', 'DELIVERY')),
  subject_id TEXT NOT NULL,
  reason_code TEXT NOT NULL CHECK (length(reason_code) BETWEEN 1 AND 128),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 1000),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'RESOLVED')),
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolution TEXT,
  UNIQUE (kind, subject_id),
  FOREIGN KEY (connector_id, account_id) REFERENCES connector_accounts(connector_id, account_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX idx_connector_dead_letters_open
  ON connector_dead_letters(connector_id, account_id, status, created_at, dead_letter_id);
