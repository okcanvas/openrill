# OR-ISSUE-276 — Startup reconciliation admitted the next Step before controller review

| Field | Value |
|---|---|
| First observed | STEP021A implementation and focused validation |
| Classification | Product durable continuation semantics |
| Direct cause | Recovery reconciled a terminal child to READY and advance immediately admitted the next Step, bypassing completion delivery and explicit controller decision. |
| Correction | Auto-admit READY only for QUEUED creation/resume; RUNNING recovery leaves READY observed until the durable controller wake acts. |
| Recurrence gate | STEP021A focused Product tests, current governance, cumulative canonical suite |

The failure is retained independently; it is not merged with adjacent Product or fixture failures.
