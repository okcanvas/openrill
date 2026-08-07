# OR-ISSUE-300 — Host adoption fixture treated terminal Step currentTaskId as permanent history

| Field | Value |
|---|---|
| First observed | STEP021B implementation and validation |
| Classification | Validation projection semantics |
| Direct cause | test expected a completed adopted Step to retain currentTaskId even though durable history is the Flow Task link and attempt count |
| Correction | assert terminal attempt count and linked Task identity instead of active currentTaskId |
| Product impact | prevented before candidate acceptance |
| Recurrence gate | STEP021B focused Product and validation governance |
