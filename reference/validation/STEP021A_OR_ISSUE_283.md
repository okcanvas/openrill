# OR-ISSUE-283 — Multi-wake fixture treated historical Tool results as current

| Field | Value |
|---|---|
| First observed | STEP021A implementation and focused validation |
| Classification | Validation fixture / Run scoping |
| Direct cause | The model adapter scanned the full conversation history and selected an old task_flow.get result for a later wake Run. |
| Correction | Use a per-wake-Run state machine and require the current wake Run's Tool result. |
| Recurrence gate | STEP021A focused Product tests, current governance, cumulative canonical suite |

The failure is retained independently; it is not merged with adjacent Product or fixture failures.
