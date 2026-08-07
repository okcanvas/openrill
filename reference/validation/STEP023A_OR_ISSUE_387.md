# OR-ISSUE-387 — SQLite changes value was treated as number-only

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: TypeScript / sqlite compatibility
- Failure: SQLite changes value was treated as number-only.
- Correction: convert statement result changes through Number(...) before arithmetic.
- Product impact: this issue is covered by STEP023A focused or governance regression and must not regress in later steps.
