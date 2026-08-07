# OR-ISSUE-386 — Retention scheduling could starve unscheduled rows beyond an already-scheduled prefix

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: bounded-query starvation / scheduling
- Failure: Retention scheduling could starve unscheduled rows beyond an already-scheduled prefix.
- Correction: query unscheduled terminal Tasks and Flows directly instead of scanning the first generic history page.
- Product impact: this issue is covered by STEP023A focused or governance regression and must not regress in later steps.
