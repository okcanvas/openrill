# OR-ISSUE-391 — Periodic sweep could repeatedly scan a protected prefix and starve later eligible history

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: periodic cursor durability / starvation
- Failure: Periodic sweep could repeatedly scan a protected prefix and starve later eligible history.
- Correction: persist the deterministic retention cursor in maintenance_sweep_state and resume it across intervals and Host restarts with revision-CAS advancement.
- Product impact: this issue is covered by STEP023A focused or governance regression and must not regress in later steps.
