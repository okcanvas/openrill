CREATE TABLE memory_records (
  memory_id TEXT NOT NULL PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('FACT', 'PREFERENCE', 'DECISION', 'CONSTRAINT', 'NOTE')),
  text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 8000),
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  source_conversation_id TEXT,
  source_run_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  forgotten_at INTEGER,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  FOREIGN KEY (source_conversation_id) REFERENCES conversations(conversation_id) ON DELETE SET NULL,
  FOREIGN KEY (source_run_id) REFERENCES agent_runs(run_id) ON DELETE SET NULL
) STRICT;

CREATE UNIQUE INDEX idx_memory_records_active_hash
  ON memory_records(workspace_id, content_hash)
  WHERE forgotten_at IS NULL;

CREATE INDEX idx_memory_records_workspace_updated
  ON memory_records(workspace_id, updated_at DESC, memory_id)
  WHERE forgotten_at IS NULL;

CREATE VIRTUAL TABLE memory_records_fts USING fts5(
  memory_id UNINDEXED,
  workspace_id UNINDEXED,
  text,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER memory_records_fts_insert
AFTER INSERT ON memory_records
WHEN NEW.forgotten_at IS NULL
BEGIN
  INSERT INTO memory_records_fts(memory_id, workspace_id, text)
  VALUES (NEW.memory_id, NEW.workspace_id, NEW.text);
END;

CREATE TRIGGER memory_records_fts_update
AFTER UPDATE OF workspace_id, text, forgotten_at ON memory_records
BEGIN
  DELETE FROM memory_records_fts WHERE memory_id = OLD.memory_id;
  INSERT INTO memory_records_fts(memory_id, workspace_id, text)
  SELECT NEW.memory_id, NEW.workspace_id, NEW.text
  WHERE NEW.forgotten_at IS NULL;
END;

CREATE TRIGGER memory_records_fts_delete
AFTER DELETE ON memory_records
BEGIN
  DELETE FROM memory_records_fts WHERE memory_id = OLD.memory_id;
END;
