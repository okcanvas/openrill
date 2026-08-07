# OR-ISSUE-296 — Delayed controller wake had no execution revision snapshot

| Field | Value |
|---|---|
| First observed | STEP021B implementation and validation |
| Classification | Durable continuation / stale decision |
| Direct cause | delivery binding did not capture Goal execution, Step and Flow revisions |
| Correction | delivery stores all three revisions and mutations reject stale snapshots before writes |
| Product impact | prevented before candidate acceptance |
| Recurrence gate | STEP021B focused Product and validation governance |
