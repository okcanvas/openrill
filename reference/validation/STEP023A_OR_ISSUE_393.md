# OR-ISSUE-393 — Historical STEP022B schema test reclaimed current schema 25

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: historical schema ownership
- Failure: the retained STEP022B migration test applied the entire current migration set and asserted `PRAGMA user_version = 25`, so additive schema 26 failed despite intact STEP022B tables.
- Correction: apply migrations through version 25 and assert STEP022B semantics there, then allow later additive migrations to advance the current schema.
- Product impact: no Connector runtime change; schema-25 historical evidence remains exact without blocking future migrations.
