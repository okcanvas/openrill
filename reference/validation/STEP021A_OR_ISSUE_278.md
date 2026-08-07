# OR-ISSUE-278 — Generic Goal tools could mutate an execution-owned Plan

| Field | Value |
|---|---|
| First observed | STEP021A implementation and focused validation |
| Classification | Product ownership / mutation isolation |
| Direct cause | goal/plan service mutations did not check agent_goal_executions, allowing revision drift or premature completion while the executor owned the Plan. |
| Correction | Add GOAL_EXECUTION_ACTIVE and fail closed for setPlan, updateStep, reportBlocker, control and complete; executor repositories remain the sole mutation owner. |
| Recurrence gate | STEP021A focused Product tests, current governance, cumulative canonical suite |

The failure is retained independently; it is not merged with adjacent Product or fixture failures.
