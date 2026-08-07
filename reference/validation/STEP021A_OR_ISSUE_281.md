# OR-ISSUE-281 — Host Goal fixture left its source Run CREATED

| Field | Value |
|---|---|
| First observed | STEP021A implementation and focused validation |
| Classification | Validation fixture / provenance lifecycle |
| Direct cause | The Host scheduled the fixture source Run and changed Goal revision during the executor scenario. |
| Correction | Transition the source Run RUNNING to COMPLETED before Goal creation, matching durable provenance evidence. |
| Recurrence gate | STEP021A focused Product tests, current governance, cumulative canonical suite |

The failure is retained independently; it is not merged with adjacent Product or fixture failures.
