# OR-ISSUE-282 — Host fixture sent an extra state field to a closed controller Tool

| Field | Value |
|---|---|
| First observed | STEP021A implementation and focused validation |
| Classification | Validation fixture / closed schema |
| Direct cause | task_flow.run was called with a public state field not allowed by the closed Tool schema. |
| Correction | Remove the invented field and assert the actual requestKey/stepKey/text contract. |
| Recurrence gate | STEP021A focused Product tests, current governance, cumulative canonical suite |

The failure is retained independently; it is not merged with adjacent Product or fixture failures.
