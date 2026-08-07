# OR-ISSUE-275 — Generic Task Flow operations could bypass ordered Goal execution

| Field | Value |
|---|---|
| First observed | STEP021A implementation and focused validation |
| Classification | Product authorization / orchestration ownership |
| Direct cause | A Goal-owned Flow was reachable through generic taskFlow.run/wait/resume/finish/fail/cancel paths. |
| Correction | Resolve Goal execution ownership by Flow and route every mutation through the Goal executor; conflicting arbitrary child requests fail closed. |
| Recurrence gate | STEP021A focused Product tests, current governance, cumulative canonical suite |

The failure is retained independently; it is not merged with adjacent Product or fixture failures.
