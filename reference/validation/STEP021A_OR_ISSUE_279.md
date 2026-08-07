# OR-ISSUE-279 — Flow cancellation could commit before Goal cancellation projection

| Field | Value |
|---|---|
| First observed | STEP021A implementation and focused validation |
| Classification | Product crash recovery / cross-ledger projection |
| Direct cause | Task Flow cancellation and Goal execution cancellation were two transactions; Host failure between them left Flow CANCELLED while Goal execution remained active. |
| Correction | Make Goal cancellation projection idempotent and have Host recovery detect a CANCELLED Flow and complete Goal/Step projection exactly once. |
| Recurrence gate | STEP021A focused Product tests, current governance, cumulative canonical suite |

The failure is retained independently; it is not merged with adjacent Product or fixture failures.
