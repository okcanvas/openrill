# OR-ISSUE-381 — Periodic retention reused reconcile APPLY and could mutate unrelated lifecycle state

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: responsibility separation / maintenance
- Failure: Periodic retention reused reconcile APPLY and could mutate unrelated lifecycle state.
- Correction: add scheduleRetention APIs so periodic retention schedules cleanup without Task LOST or Flow cancellation reconciliation.
- Product impact: this issue is covered by STEP023A focused or governance regression and must not regress in later steps.
