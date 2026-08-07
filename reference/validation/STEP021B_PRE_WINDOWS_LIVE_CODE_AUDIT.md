# STEP021B Pre-Windows-Live Code Audit

```text
AUDIT=STEP021B_PRE_WINDOWS_LIVE_CODE_AUDIT
MODE=READ_ONLY
SOURCE_MODIFICATIONS=0
CANDIDATE=STEP021B_DURABLE_PLAN_REVISION_RETRY_AND_BLOCKER_RESOLUTION_CLOSURE
VERSION=0.21.1-step021b
SCHEMA=24
VERDICT=BLOCKED_CORRECTIVE_REQUIRED
OFFICIAL_BASELINE=STEP021A_DURABLE_GOAL_PLAN_TO_TASK_FLOW_EXECUTOR_FOUNDATION
```

## Package evidence directly verified

```text
zip=openrill-step021b-durable-plan-revision-retry-blocker-resolution-closure-v1.zip
sha256=bfb4f544f8f607223bc38b79c018df234d6c84f4f0fffe3d23542d33abbb03f2
size=2675415
zip_entries=1642
manifest_files=1641
crc_errors=0
package_manifest=1641/1641
source_version=0.21.1-step021b
source_manifests=38
source_packages=37
workspace_lock=38 importers / 101 dependencies
architecture=37 packages / 98 edges / 168 sources
deterministic_repack=BYTE_IDENTICAL
```

`workspace-module-links` was not evaluated as a Product failure because the source ZIP intentionally excludes `node_modules`; this pre-install check fails until `pnpm install --frozen-lockfile` materializes workspace links. The current environment could not fetch pnpm from npm, so build and Node test stages were not rerun here.

## Blocking finding 1 — changed completed Step is incorrectly preserved

The adoption code constructs `oldPlanById`, but preservation does not compare the old and target immutable definitions. It checks only whether the prior Step execution status is `SUCCEEDED` or `SKIPPED`.

```text
packages/goal-executor/src/service.ts:618-630
- old immutable definitions are available in oldPlanById
- preserved = previous status is SUCCEEDED or SKIPPED
- target definition equality is not checked
```

The projected target revision also copies `attemptCount` from the old revision even when the Step is not preserved.

```text
packages/goal-executor/src/service.ts:636-644
status = preserved ? terminal : PENDING
attemptCount = previous?.attemptCount ?? 0
```

Therefore a completed Step whose `stepId` is reused but whose title, required flag, retry policy, or max-attempt policy changed is carried into the new revision as already complete. This contradicts the declared contract:

```text
completed stable Step -> preserved
new or changed Step -> PENDING
```

The focused test changes only the unfinished second Step. It never changes an already completed Step with the same `stepId`, so the defect is outside the current 20/20 evidence.

## Blocking finding 2 — pinned older execution can overwrite current revised Plan status

`revisePlan` updates the mutable `agent_goal_plan_steps` definition to the newest title and ordinal while the running execution remains pinned to the older immutable revision.

Later, success, blocker, failure, admission, resume, and cancellation projections update `agent_goal_plan_steps` by `goalId + stepId` without verifying that the current Goal revision definition is semantically identical to the pinned execution definition.

Representative path:

```text
packages/goal-executor/src/service.ts:1091-1108
old pinned revision Step succeeds
-> getStep(goalId, stepId) reads mutable current definition
-> updateStep(... status=COMPLETED ...)
```

`GoalRepository.listSteps` combines the newest immutable revision title/ordinal with the mutable global status:

```text
packages/state/src/goal-repository.ts:300-319
current revision definition title/ordinal
+
agent_goal_plan_steps status/provenance
```

Result: revision 1 can execute the old meaning of a Step and mark the changed revision 2 definition `COMPLETED` before explicit adoption. The adoption bug then preserves that contaminated completion.

This violates both boundaries:

```text
new revision has no execution effect before adoption
changed Step starts PENDING after adoption
```

## Blocking finding 3 — open-blocker adoption guard is capped at 200 ledger rows

Adoption checks for an open blocker through:

```text
listBlockers(goalId, pinnedRevision, 200).find(status == OPEN)
```

The ledger permits up to 200 Steps and repeated distinct blocker fingerprints. More than 200 historical blocker rows are possible. If the first 200 rows are resolved and a later row is open, adoption can miss the open blocker and proceed.

The invariant “no open blocker” must use an unbounded existence query, for example `hasOpenBlocker(goalId, planRevision)` or `getAnyOpenBlocker(...)`, not a presentation-limit list query.

## Acceptance gap

The Windows runner proves only the existing focused test names and counts. It checks for text such as:

```text
explicit adoption preserves completed stable Steps
```

but the underlying test covers only an unchanged completed Step and a changed unfinished Step. It does not cover:

1. changed completed Step with the same `stepId`;
2. current Plan status contamination while execution remains pinned;
3. an open blocker beyond the first 200 ledger rows.

Consequently the proposed `24/24` Windows marker can pass while all three blocking paths remain.

## Required corrective closure

Recommended corrective identity:

```text
STEP=STEP021BR1_PLAN_REVISION_STABLE_STEP_IDENTITY_AND_OPEN_BLOCKER_GUARD_CLOSURE
VERSION=0.21.2-step021br1
SCHEMA=24
```

Required Product changes:

1. Define one explicit semantic-stability predicate for immutable revision Step definitions.
2. Preserve terminal results only when the Step definition satisfies that predicate.
3. Reset `attemptCount`, terminal outcome, summary, timestamps, retry metadata, and active Task identity for changed/new Steps.
4. Prevent a pinned older revision from projecting mutable current-Plan status/provenance onto a changed current revision Step.
5. Replace the 200-row blocker scan with a fail-closed open-blocker existence query.
6. Add focused Product, protocol, Host restart, governance, and Windows Harness checks for all three paths.

Required recurrence records:

```text
OR-ISSUE-303 changed completed Step preserved by status-only adoption
OR-ISSUE-304 pinned revision contaminated mutable current Plan status
OR-ISSUE-305 open-blocker guard used a bounded presentation query
```

## Promotion decision

```text
STEP021B source_package=BLOCKED_CORRECTIVE_REQUIRED
STEP021B windows_live=DO_NOT_RUN_FOR_PROMOTION
STEP021A official_product_baseline=RETAINED
```

A Windows run of the current ZIP may still be useful only as diagnostic evidence, but it must not promote STEP021B because the current Harness does not own the missing contracts.
