# STEP021BR1 local source/package acceptance

```text
STEP=STEP021BR1_PLAN_REVISION_STABLE_STEP_IDENTITY_AND_OPEN_BLOCKER_GUARD_CLOSURE
VERSION=0.21.2-step021br1
STATE_SCHEMA=24
SOURCE_PACKAGE=CODE_LEVEL_ACCEPTED
CHECKS=67/67
STATE=PASSED
FOCUSED_PRODUCT=22/22
AFFECTED_REGRESSION=116/116
GOVERNANCE=201/201
CANONICAL_FILES=161
CANONICAL_TESTS=842/842
CANONICAL_SKIPPED=0
MANIFEST=1654/1654
ARCHITECTURE=37 packages / 98 edges / 168 sources
EXPORTS=37/37
AUTOMATED_RUN_SECONDS=208.088
WINDOWS_PLAN_REVISION_CORRECTIVE_LIVE=PENDING_ENV
PROMOTION=WINDOWS_PLAN_REVISION_CORRECTIVE_LIVE_PENDING
OFFICIAL_PRODUCT_BASELINE=STEP021A_DURABLE_GOAL_PLAN_TO_TASK_FLOW_EXECUTOR_FOUNDATION
```

## Corrective coverage

- semantic stable-Step equality compares `stepId`, `title`, `required`, `retryMode`, and `maxAttempts`;
- changed/new Steps reset execution attempt and terminal-result history before adoption;
- completion from an older pinned revision cannot mutate a changed current Plan projection;
- adoption rejects an OPEN blocker beyond the first 200 historical rows through a dedicated unbounded existence query;
- Local Protocol executes the changed Step before blocker resolution and bounded retry;
- Host restart re-executes the changed completed Step and ends with exactly four unique durable child Tasks;
- retained STEP021A and STEP021B Product, migration, protocol, retry, stale-decision, and restart scenarios remain green.

## Toolchain disclosure

```text
NODE=v22.16.0
TYPESCRIPT=5.8.3 compatibility execution
PACKAGE_MANAGER_DECLARED=pnpm@11.15.1
PNPM_FROZEN_INSTALL=NOT_RUN
REASON=pnpm 11.15.1 was not cached and registry access failed in this environment
```

The full build and test aggregate was executed through the repository scripts with materialized workspace links and the available global TypeScript compiler. This is valid code-level evidence, but it is not represented as the exact frozen Windows dependency-install proof.

## Required Windows transition

```powershell
pnpm install --frozen-lockfile
pnpm acceptance:step021br1:live
```

Expected inner marker:

```text
STEP021BR1_PLAN_REVISION_STABLE_STEP_IDENTITY_AND_OPEN_BLOCKER_GUARD_CLOSURE checks=24/24 state=PASSED version=0.21.2-step021br1 schema=24 stability=SEMANTIC_DEFINITION_MATCH changed_step=FRESH_EXECUTION_HISTORY mutable_plan=STABLE_DEFINITION_ONLY blocker_guard=UNBOUNDED_OPEN_EXISTENCE retry=MANUAL_BOUNDED_NEW_ATTEMPT decision=REVISION_SNAPSHOT_STALE_REJECTED restart=CHANGED_STEP_REEXECUTION_DUPLICATE_FREE executor=SINGLE_ACTIVE_STEP parallel=DEFERRED provider=SCRIPTED_LOCAL openclaw_reference=BOUND_CONTROLLER_SOURCE_REAUDITED live_harness=STEP021BR1_H1_CHANGED_STEP_REEXECUTION_MUTABLE_ISOLATION_OPEN_BLOCKER_AND_RESTART
```

Until that Windows run passes, STEP021A remains the official Product baseline.
