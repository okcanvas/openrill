# OR-ISSUE-280 — Protocol fixture omitted the real cancellation runtime

| Field | Value |
|---|---|
| First observed | STEP021A implementation and focused validation |
| Classification | Validation fixture / Host parity |
| Direct cause | The direct operation-registry fixture instantiated the controller runtime without cancelTask, unlike the real Host. |
| Correction | Provide the same cancellation callback as production and keep cancellation behavior strict. |
| Recurrence gate | STEP021A focused Product tests, current governance, cumulative canonical suite |

The failure is retained independently; it is not merged with adjacent Product or fixture failures.
