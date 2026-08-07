# OR-ISSUE-284 — Restart fixture reused a Tool call ID across Runs

| Field | Value |
|---|---|
| First observed | STEP021A implementation and focused validation |
| Classification | Validation fixture / durable Tool replay |
| Direct cause | A post-restart child reused an earlier Tool call ID, correctly causing exact checkpoint replay of stale output. |
| Correction | Scope fixture Tool call IDs by durable Run ID and retain replay behavior as a Product invariant. |
| Recurrence gate | STEP021A focused Product tests, current governance, cumulative canonical suite |

The failure is retained independently; it is not merged with adjacent Product or fixture failures.
