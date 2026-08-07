# OR-ISSUE-392 — STEP023A governance test guessed source wording and deletion implementation details

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: validation precision / source-token ownership
- Failure: the first STEP023A governance draft required invented wording (`durable sweep cursor`), the wrong schema constant name, a literal Task DELETE statement even though deletion is table-selected, non-optional Config syntax, and the wrong maintenance timer variable name.
- Correction: governance now asserts the actual contract wording, `OPENRILL_STATE_SCHEMA_VERSION`, tombstone-before-dynamic-delete source order, and the actual optional maintenance config access.
- Product impact: no Product runtime defect; the failed governance draft is retained so later validation does not distort code to satisfy guessed tokens.
