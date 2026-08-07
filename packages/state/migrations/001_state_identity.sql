CREATE TABLE state_identity (
  id INTEGER NOT NULL PRIMARY KEY CHECK (id = 1),
  product TEXT NOT NULL CHECK (product = 'OpenRill'),
  profile TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (schema_version) REFERENCES schema_migrations(version)
    ON UPDATE CASCADE ON DELETE RESTRICT
) STRICT;
