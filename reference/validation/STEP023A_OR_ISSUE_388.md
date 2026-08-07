# OR-ISSUE-388 — Focused Goal fixture guessed a nonexistent agent_goals title column

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: validation fixture / schema precision
- Failure: Focused Goal fixture guessed a nonexistent agent_goals title column.
- Correction: use the actual objective column from schema instead of inferred naming.
- Product impact: this issue is covered by STEP023A focused or governance regression and must not regress in later steps.
