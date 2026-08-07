# OR-ISSUE-379 — Cascade deletion could erase evidence before a durable prune marker

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: audit durability / delete ordering
- Failure: Cascade deletion could erase evidence before a durable prune marker.
- Correction: write a minimal hashed retention tombstone in the same transaction before deleting the root ledger row.
- Product impact: this issue is covered by STEP023A focused or governance regression and must not regress in later steps.
