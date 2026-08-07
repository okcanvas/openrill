# OR-ISSUE-295 — Failed Step terminalized Flow before bounded retry

| Field | Value |
|---|---|
| First observed | STEP021B implementation and validation |
| Classification | Product lifecycle / retryability |
| Direct cause | Task failure moved the Flow to terminal FAILED, preventing a new attempt |
| Correction | failure projects durable BLOCKED plus TASK_FAILURE/RETRY_LIMIT blocker while Flow remains resumable |
| Product impact | prevented before candidate acceptance |
| Recurrence gate | STEP021B focused Product and validation governance |
