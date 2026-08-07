# OR-ISSUE-378 — Physical prune had no durable cross-Host ownership

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: maintenance concurrency / lease ownership
- Failure: Physical prune had no durable cross-Host ownership.
- Correction: maintenance_leases provides expiring owner/token leases and every delete transaction verifies current lease ownership.
- Product impact: this issue is covered by STEP023A focused or governance regression and must not regress in later steps.
