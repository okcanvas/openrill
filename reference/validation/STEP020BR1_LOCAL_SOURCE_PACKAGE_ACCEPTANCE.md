# STEP020BR1 Local Source/Package Acceptance

## Scope

This evidence records the code-level source/package acceptance for `STEP020BR1_TASK_FLOW_OWNER_SCOPE_AND_CANCEL_ADMISSION_CLOSURE`. It does not claim Windows LIVE acceptance or Product-baseline promotion.

## Recorded acceptance marker

```text
STEP020BR1_TASK_FLOW_OWNER_SCOPE_AND_CANCEL_ADMISSION_CLOSURE checks=34/34 state=PASSED version=0.20.2-step020br1 schema=20 accepted_product_baseline=STEP020B_DURABLE_TASK_FLOW_REGISTRY_AND_CONTROLLER_LIFECYCLE_FOUNDATION accepted_checks=37/37 owner=CONVERSATION_SCOPED migration=LEGACY_ISOLATED admission=CANCEL_REQUEST_CLOSED replay=EXACT_LINK_STABLE reverse=TASK_TO_FLOW terminal_attachment=SAME_OWNER_ALLOWED executor=DEFERRED openclaw_reference=OWNER_ADMISSION_SOURCE_REAUDITED external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM focused_product=10 affected_regression=73 governance=129 canonical_files=132 canonical_tests=712 windows_task_flow_owner_live=PENDING_ENV live_harness=STEP020BR1_H1_TASK_FLOW_OWNER_SCOPE_CANCEL_ADMISSION_AND_RESTART promotion=WINDOWS_TASK_FLOW_OWNER_LIVE_PENDING automated_run_seconds=161.780
```

## Verified contract

- schema 20 persists a Conversation-scoped Task Flow `ownerKey`;
- schema 19 rows are retained and either backfilled to one proven Conversation owner or isolated under `legacy:<flowId>`;
- cross-Conversation Task admission is rejected even inside the same Workspace;
- a persisted cancellation request closes admission for new child Tasks;
- exact replay of an already linked Task remains revision-stable;
- Task-to-Flow reverse projection is available;
- same-owner terminal Task attachment remains an explicit registry-history policy;
- bound controller runtime and autonomous Plan-to-Task execution remain deferred.

## Validation totals

```text
checks=34/34
focused_product=10/10
affected_regression=73/73
governance=129/129
canonical_files=132
canonical_tests=712/712
canonical_skipped=0
architecture=36 packages / 92 edges / 156 sources
exports=36/36
manifest=1467/1467
automated_run_seconds=161.780
```

## Windows status

```text
windows_task_flow_owner_live=PENDING
live_harness=STEP020BR1_H1_TASK_FLOW_OWNER_SCOPE_CANCEL_ADMISSION_AND_RESTART
accepted_product_baseline=STEP020B_DURABLE_TASK_FLOW_REGISTRY_AND_CONTROLLER_LIFECYCLE_FOUNDATION
```
