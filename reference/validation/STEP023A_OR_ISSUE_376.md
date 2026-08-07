# OR-ISSUE-376 — Retention expiry alone could authorize unsafe physical deletion

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: retention safety / reference protection
- Failure: Retention expiry alone could authorize unsafe physical deletion.
- Correction: inspect current Run, Task, Flow, Goal, blocker, completion-delivery and Connector dependencies immediately before delete; delete only a terminal due entity with zero protections.
- Product impact: this issue is covered by STEP023A focused or governance regression and must not regress in later steps.
