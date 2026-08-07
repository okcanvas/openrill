# OR-ISSUE-394 — Historical STEP022B governance froze the global schema constant at 25

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: historical governance / schema ownership
- Failure: STEP022B governance still required `OPENRILL_STATE_SCHEMA_VERSION = 25`, blocking additive schema 26.
- Correction: STEP022B governance proves migration 025 and requires only that the current schema has not regressed below 25.
- Product impact: none; Connector schema-25 evidence remains immutable.
