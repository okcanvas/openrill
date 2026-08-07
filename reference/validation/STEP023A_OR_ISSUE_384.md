# OR-ISSUE-384 — Historical STEP004 test froze the complete Local Protocol operation list

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: historical validation ownership
- Failure: Historical STEP004 test froze the complete Local Protocol operation list.
- Correction: assert retained STEP004 operations plus no duplicates while allowing later additive operations.
- Product impact: this issue is covered by STEP023A focused or governance regression and must not regress in later steps.
