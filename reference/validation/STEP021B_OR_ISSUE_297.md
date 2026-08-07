# OR-ISSUE-297 — Start replay rejected an execution pinned to an older Plan revision

| Field | Value |
|---|---|
| First observed | STEP021B implementation and validation |
| Classification | Replay identity / revision pinning |
| Direct cause | start compared execution.planRevision with the mutable current Goal planRevision |
| Correction | replay validates durable owner/controller/Flow binding and preserves the pinned immutable revision |
| Product impact | prevented before candidate acceptance |
| Recurrence gate | STEP021B focused Product and validation governance |
