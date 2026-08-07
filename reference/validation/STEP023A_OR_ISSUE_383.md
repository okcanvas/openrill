# OR-ISSUE-383 — Tombstone conflict could permit deletion without fresh evidence

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: audit identity / fail-closed deletion
- Failure: Tombstone conflict could permit deletion without fresh evidence.
- Correction: remove ON CONFLICT DO NOTHING; a tombstone primary-key collision aborts the transaction and preserves the entity.
- Product impact: this issue is covered by STEP023A focused or governance regression and must not regress in later steps.
