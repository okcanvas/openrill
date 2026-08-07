# STEP021BR1_PLAN_REVISION_STABLE_STEP_IDENTITY_AND_OPEN_BLOCKER_GUARD_CLOSURE

```text
STEP=STEP021BR1_PLAN_REVISION_STABLE_STEP_IDENTITY_AND_OPEN_BLOCKER_GUARD_CLOSURE
VERSION=0.21.2-step021br1
STATE_SCHEMA=24
PARENT=STEP021B_DURABLE_PLAN_REVISION_RETRY_AND_BLOCKER_RESOLUTION_CLOSURE
OFFICIAL_PRODUCT_BASELINE=STEP021A_DURABLE_GOAL_PLAN_TO_TASK_FLOW_EXECUTOR_FOUNDATION
PROMOTION=WINDOWS_PLAN_REVISION_CORRECTIVE_LIVE_PENDING
```

## Why this corrective exists

A pre-Windows-Live code audit found three contract gaps in STEP021B. Adoption treated a completed Step as stable by status and `stepId` alone; completion from an execution pinned to an older revision could project into a changed mutable current Plan Step; and the adoption guard searched only the first 200 blocker rows. The original package and audit are preserved as historical evidence.

## Closed Product boundaries

1. **Semantic stable-Step identity.** A Step is stable only when `stepId`, `title`, `required`, `retryMode`, and `maxAttempts` match between immutable revisions. Ordinal-only movement preserves semantic completion; a changed or new Step starts with fresh `PENDING` execution history and `attemptCount=0` before admission.
2. **Pinned execution projection isolation.** An execution pinned to an older revision may update the mutable current Plan projection only when the current immutable Step definition is semantically identical. A changed current Step remains `PENDING` even if the older meaning completes.
3. **Unbounded blocker existence guard.** Adoption uses a dedicated `getAnyOpenBlocker(goalId, planRevision)` query. Presentation pagination and its limit cannot decide lifecycle safety.
4. **Restart contract.** After revision 1 Step 1 completes, revision 2 changes Step 1. Adoption re-executes changed Step 1, then executes Steps 2 and 3. The final durable child Task count is exactly four and contains no duplicate IDs.

## Required validation

- changed completed Step resets and is re-admitted as a new Task attempt;
- old pinned completion cannot contaminate the changed current Plan projection;
- an OPEN blocker at ledger position 201 still rejects adoption;
- Local Protocol completes the changed Step before blocker resolution and retry;
- Host restart restores identity and produces exactly four child Tasks;
- all STEP021B and STEP021A retained Product scenarios remain green.

## Windows command

```powershell
pnpm install --frozen-lockfile
pnpm acceptance:step021br1:live
```

Expected focused marker:

```text
STEP021BR1_PLAN_REVISION_STABLE_STEP_IDENTITY_AND_OPEN_BLOCKER_GUARD_CLOSURE checks=24/24 state=PASSED version=0.21.2-step021br1 schema=24 ... live_harness=STEP021BR1_H1_CHANGED_STEP_REEXECUTION_MUTABLE_ISOLATION_OPEN_BLOCKER_AND_RESTART
```
