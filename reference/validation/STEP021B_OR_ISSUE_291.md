# OR-ISSUE-291 — Plan revision number lacked immutable definition history

| Field | Value |
|---|---|
| First observed | STEP021B implementation and validation |
| Classification | Product data model / revision drift |
| Direct cause | agent_goal_plan_steps was mutable, so pinning only planRevision could not reconstruct historical execution meaning |
| Correction | schema 24 immutable agent_goal_plan_revision_steps snapshots and executor reads only its pinned snapshot |
| Product impact | prevented before candidate acceptance |
| Recurrence gate | STEP021B focused Product and validation governance |
