# STEP021B Durable Plan Revision, Retry and Blocker Resolution Closure

```text
step=STEP021B_DURABLE_PLAN_REVISION_RETRY_AND_BLOCKER_RESOLUTION_CLOSURE
version=0.21.1-step021b
schema=24
baseline=STEP021A Windows LIVE 58/58
```

## Purpose

STEP021B keeps a running Goal execution pinned to an immutable ordered Plan snapshot while allowing a newer Plan revision to be authored and explicitly adopted. It adds a durable blocker ledger and manual bounded retry. It does not add parallel execution, a general DAG scheduler, model-driven replanning or unbounded automatic retry.

## Contract

- Every Goal execution reads `agent_goal_plan_revision_steps` for its pinned `planRevision`.
- `goalExecution.revisePlan` creates a newer immutable snapshot without mutating the running execution.
- `goalExecution.adoptPlanRevision` is explicit, requires no active child and no open blocker, and preserves only completed stable Step identities.
- Retry mode is `MANUAL`; every retry creates a new Run/Task/Attempt through the existing atomic admission path.
- BLOCKED and FAILED Steps create durable blocker records. Generic resume cannot bypass them.
- Completion deliveries bind Goal execution, Step and Flow revisions; stale controller decisions fail before mutation.
- Host restart preserves the pinned revision, active Task identity and blocker/retry state.
