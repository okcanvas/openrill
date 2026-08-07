# STEP021B Local Source/Package Acceptance

```text
STEP021B_DURABLE_PLAN_REVISION_RETRY_AND_BLOCKER_RESOLUTION_CLOSURE checks=54/54 state=PASSED version=0.21.1-step021b schema=24 accepted_product_baseline=STEP021A_DURABLE_GOAL_PLAN_TO_TASK_FLOW_EXECUTOR_FOUNDATION accepted_checks=58/58 revision=IMMUTABLE_EXECUTION_SNAPSHOT adoption=EXPLICIT_STABLE_STEP retry=MANUAL_BOUNDED_NEW_ATTEMPT blocker=DURABLE_RESOLUTION_LEDGER decision=REVISION_SNAPSHOT_STALE_REJECTED restart=PINNED_REVISION_IDENTITY_STABLE executor=SINGLE_ACTIVE_STEP parallel=DEFERRED openclaw_reference=BOUND_CONTROLLER_SOURCE_REAUDITED external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM focused_product=20 affected_regression=116 governance=192 canonical_files=160 canonical_tests=831 windows_goal_plan_revision_live=PENDING_ENV live_harness=STEP021B_H1_PLAN_REVISION_ADOPTION_RETRY_BLOCKER_AND_RESTART promotion=WINDOWS_GOAL_PLAN_REVISION_LIVE_PENDING automated_run_seconds=77.580
```

## Scope proved

- immutable Plan revision snapshots pin active execution definitions
- explicit newer-revision adoption preserves completed stable Steps
- durable blocker ledger and explicit resolution prevent generic resume bypass
- bounded manual retry creates a new Run/Task/Attempt and enforces maxAttempts
- delayed controller decisions are rejected by execution/Step/Flow revision snapshots
- Host restart preserves the pinned revision, active Task identity and zero duplicate admission
- schema 23 to 24 migration is non-destructive

## Aggregate evidence

```text
focused_product=20/20
affected_regression=116/116
governance=192/192
canonical_files=160
canonical_tests=831/831
canonical_skipped=0
manifest=1641/1641
architecture=37 packages / 98 edges / 168 sources
exports=37/37
automated_run_seconds=77.580
```

Windows Goal Plan revision LIVE remains pending. The official Product baseline remains STEP021A until `pnpm acceptance:step021b:live` passes.
