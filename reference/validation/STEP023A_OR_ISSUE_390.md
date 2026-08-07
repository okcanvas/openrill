# OR-ISSUE-390 — Lease-loss test clock advanced slowly enough for proactive renewal

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: validation fixture / temporal contract
- Failure: Lease-loss test clock advanced slowly enough for proactive renewal.
- Correction: force an abrupt deterministic clock jump so the test actually loses ownership before the next delete.
- Product impact: this issue is covered by STEP023A focused or governance regression and must not regress in later steps.
