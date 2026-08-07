# OR-ISSUE-385 — Historical STEP020D Host test froze global startup retention behavior

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: historical validation ownership
- Failure: Historical STEP020D Host test froze global startup retention behavior.
- Correction: disable STEP023A auto-arm in the STEP020D fixture so it tests only STEP020D reconciliation semantics.
- Product impact: this issue is covered by STEP023A focused or governance regression and must not regress in later steps.
