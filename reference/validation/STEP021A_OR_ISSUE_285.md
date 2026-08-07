# OR-ISSUE-285 — Governance invented a `one_active` index token

| Field | Value |
|---|---|
| First observed | STEP021A current governance |
| Classification | Validation governance / implementation-token invention |
| Direct cause | The migration uses `idx_agent_goal_step_executions_single_active`, but governance searched for nonexistent `one_active`. |
| Correction | Assert the inspected `single_active` index and its active-status predicate. |
| Product impact | none |
| Recurrence gate | corrected STEP021A governance plus cumulative canonical suite |
