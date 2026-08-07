# OR-ISSUE-277 — Blocked Step left the durable Goal ACTIVE

| Field | Value |
|---|---|
| First observed | STEP021A implementation and focused validation |
| Classification | Product state projection consistency |
| Direct cause | Semantic BLOCKED updated Step, Plan, Flow and execution but omitted Goal status. |
| Correction | Project Goal ACTIVE to BLOCKED in the same reconciliation transaction and prove explicit resume restores ACTIVE. |
| Recurrence gate | STEP021A focused Product tests, current governance, cumulative canonical suite |

The failure is retained independently; it is not merged with adjacent Product or fixture failures.
