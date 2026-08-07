# OR-ISSUE-294 — Generic resume bypassed durable blocker resolution

| Field | Value |
|---|---|
| First observed | STEP021B implementation and validation |
| Classification | Product lifecycle / blocker evidence |
| Direct cause | BLOCKED execution could be resumed without resolving an OPEN blocker |
| Correction | BLOCKED and FAILED require explicit resolveBlocker or retry with ledger evidence |
| Product impact | prevented before candidate acceptance |
| Recurrence gate | STEP021B focused Product and validation governance |
