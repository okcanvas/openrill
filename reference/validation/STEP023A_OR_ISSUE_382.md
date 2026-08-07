# OR-ISSUE-382 — Completed final retention page returned a stale input cursor

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: pagination / continuation correctness
- Failure: Completed final retention page returned a stale input cursor.
- Correction: return null at end-of-scan and only return the last processed cursor when another page or lease-loss continuation exists.
- Product impact: this issue is covered by STEP023A focused or governance regression and must not regress in later steps.
