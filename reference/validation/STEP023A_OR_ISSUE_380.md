# OR-ISSUE-380 — Ambiguous Connector delivery history could be auto-pruned

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: delivery certainty / retention safety
- Failure: Ambiguous Connector delivery history could be auto-pruned.
- Correction: UNCERTAIN/DEAD work and OPEN dead letters remain protected; DELIVERED requires a durable provider receipt.
- Product impact: this issue is covered by STEP023A focused or governance regression and must not regress in later steps.
