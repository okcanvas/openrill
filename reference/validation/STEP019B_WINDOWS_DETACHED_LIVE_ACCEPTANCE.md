# STEP019B Windows Detached LIVE Acceptance

## Evidence source

This marker is the operator-supplied output from the actual Windows command sequence on 2026-08-05. It is retained verbatim as acceptance evidence and is not reconstructed from local Linux execution.

```cmd
pnpm install --frozen-lockfile
pnpm acceptance:step019b:live
```

```text
STEP019B_DETACHED_RUN_AND_HOST_RESTART_AUTO_RESUME_FOUNDATION checks=36/36 state=PASSED version=0.19.1-step019b schema=17 accepted_product_baseline=STEP019A_DURABLE_GOAL_PLAN_AND_LONG_RUNNING_TASK_STATE accepted_checks=38/38 detached=PROTOCOL_ACK_FIRST restart=HOST_AUTO_RESUME checkpoint=TOOL_EXACTLY_ONCE attempt=FRESH_BEFORE_PREPARATION cancellation=OPERATOR_TERMINAL recovery=CHECKPOINT_FAIL_CLOSED provenance=WORKSPACE_CONVERSATION_RUN_ATTEMPT external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM focused_product=6 affected_regression=29 governance=104 canonical_files=121 canonical_tests=668 windows_detached_live=PASSED live_harness=STEP019B_H1_DETACHED_PROTOCOL_HOST_RESTART_AUTO_RESUME promotion=READY automated_run_seconds=144.423
```

## Promotion

`STEP019B_DETACHED_RUN_AND_HOST_RESTART_AUTO_RESUME_FOUNDATION` is the accepted Product baseline for all subsequent work.

## Intentionally unexecuted dimensions

- External model: `NOT_RUN`
- Browser LIVE: `NOT_RUN`
- Real connector: `DEFERRED_NO_REAL_SYSTEM`

## Accepted artifact

```text
openrill-step019b-detached-run-host-restart-auto-resume-foundation-v1.zip
sha256=9b9a9f4fc1eea913b4cc42bfd698e367bbfd71945ccb5c02db8e82bca831f6fc
```
