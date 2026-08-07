# STEP020A Windows Task LIVE Acceptance

## Evidence source

This marker is the operator-supplied output from the actual Windows command sequence on 2026-08-05. It is retained verbatim as acceptance evidence and is not reconstructed from local Linux execution.

```cmd
pnpm install --frozen-lockfile
pnpm acceptance:step020a:live
```

```text
STEP020A_DURABLE_BACKGROUND_TASK_LEDGER_AND_RUNTIME_LIFECYCLE_FOUNDATION checks=40/40 state=PASSED version=0.20.0-step020a schema=18 accepted_product_baseline=STEP019B_DETACHED_RUN_AND_HOST_RESTART_AUTO_RESUME_FOUNDATION accepted_checks=36/36 task=RUN_LINKED_LEDGER runtime=CONVERSATION_DELEGATION_AUTOMATION restart=TASK_IDENTITY_STABLE cancellation=OWNING_RUN_TERMINAL terminal=MONOTONE flow=DEFERRED openclaw_reference=TASK_LIFECYCLE_SOURCE_AUDITED external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM focused_product=9 affected_regression=56 governance=115 canonical_files=126 canonical_tests=688 windows_task_live=PASSED live_harness=STEP020A_H1_DURABLE_TASK_PROTOCOL_RESTART_AND_CANCELLATION promotion=READY automated_run_seconds=169.594
```

## Promotion

`STEP020A_DURABLE_BACKGROUND_TASK_LEDGER_AND_RUNTIME_LIFECYCLE_FOUNDATION` is the accepted Product baseline for all subsequent work.

## Intentionally unexecuted dimensions

- Task Flow: `DEFERRED`
- External model: `NOT_RUN`
- Browser LIVE: `NOT_RUN`
- Real connector: `DEFERRED_NO_REAL_SYSTEM`

## Accepted artifact

```text
openrill-step020a-durable-background-task-ledger-runtime-lifecycle-foundation-v1.zip
sha256=67ac1fa4a5067ff3070f0a990bfdfd262a6d956961ebd221432cdacf567c9a7f
```
