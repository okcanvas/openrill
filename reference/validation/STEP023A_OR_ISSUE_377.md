# OR-ISSUE-377 — Connector delivery had no durable cleanup schedule

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: schema / retention lifecycle
- Failure: Connector delivery had no durable cleanup schedule.
- Correction: schema 26 adds connector_deliveries.cleanup_after and schedules only safe DELIVERED/SUPPRESSED deliveries.
- Product impact: this issue is covered by STEP023A focused or governance regression and must not regress in later steps.
