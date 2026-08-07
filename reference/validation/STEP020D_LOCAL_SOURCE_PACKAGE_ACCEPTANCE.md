# STEP020D Local Source and Package Acceptance

This evidence records the document-inclusive source/package acceptance after all STEP020D implementation and OR-ISSUE-247 through OR-ISSUE-258 corrections. It does not claim Windows LIVE acceptance or Product-baseline promotion.

```text
STEP020D_TASK_AND_TASK_FLOW_RECONCILIATION_LOST_AND_RETENTION_FOUNDATION checks=52/52 state=PASSED version=0.20.4-step020d schema=21 accepted_product_baseline=STEP020C_BOUND_TASK_FLOW_CONTROLLER_RUNTIME_AND_ATOMIC_CHILD_TASK_ADMISSION accepted_checks=43/43 maintenance=AUDIT_RECONCILE_RETENTION authority=RUN_RUNTIME_SOT lost=RECOVERY_GRACE_RUNTIME_AUTHORITY startup=SAFE_RECONCILE_NO_RETENTION flow=CONTROLLER_OWNED_OUTCOME cancellation=STUCK_REPLAY_FINALIZE retention=PREVIEW_SCHEDULE_NO_PRUNE idempotency=REPEATED_APPLY_STABLE plan_executor=DEFERRED openclaw_reference=TASK_AND_FLOW_MAINTENANCE_SOURCE_AUDITED external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM focused_product=8 affected_regression=91 governance=150 canonical_files=141 canonical_tests=749 windows_maintenance_live=PENDING_ENV live_harness=STEP020D_H1_TASK_FLOW_MAINTENANCE_RECONCILIATION_LOST_AND_RETENTION promotion=WINDOWS_MAINTENANCE_LIVE_PENDING automated_run_seconds=59.117
```

Validation dimensions:

```text
focused_product=8/8
affected_regression=91/91
governance=150/150
canonical=141 files / 749/749 / skipped 0
architecture=36 packages / 93 edges / 159 sources
exports=36/36
manifest=1512/1512
```

The final record-state rerun may have a different elapsed time while retaining the same Product and test counts. Windows must run `pnpm acceptance:step020d:live` before promotion.
