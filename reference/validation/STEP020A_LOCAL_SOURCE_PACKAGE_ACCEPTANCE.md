# STEP020A Local Source and Package Acceptance

## Candidate identity

```text
step=STEP020A_DURABLE_BACKGROUND_TASK_LEDGER_AND_RUNTIME_LIFECYCLE_FOUNDATION
version=0.20.0-step020a
state_schema=18
accepted_product_baseline=STEP019B_DETACHED_RUN_AND_HOST_RESTART_AUTO_RESUME_FOUNDATION
accepted_checks=36/36
accepted_sha256=9b9a9f4fc1eea913b4cc42bfd698e367bbfd71945ccb5c02db8e82bca831f6fc
```

## Complete source/package aggregate

```text
STEP020A_DURABLE_BACKGROUND_TASK_LEDGER_AND_RUNTIME_LIFECYCLE_FOUNDATION checks=39/39 state=PASSED version=0.20.0-step020a schema=18 accepted_product_baseline=STEP019B_DETACHED_RUN_AND_HOST_RESTART_AUTO_RESUME_FOUNDATION accepted_checks=36/36 task=RUN_LINKED_LEDGER runtime=CONVERSATION_DELEGATION_AUTOMATION restart=TASK_IDENTITY_STABLE cancellation=OWNING_RUN_TERMINAL terminal=MONOTONE flow=DEFERRED openclaw_reference=TASK_LIFECYCLE_SOURCE_AUDITED external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM focused_product=9 affected_regression=56 governance=115 canonical_files=126 canonical_tests=688 windows_task_live=PENDING_ENV live_harness=STEP020A_H1_DURABLE_TASK_PROTOCOL_RESTART_AND_CANCELLATION promotion=WINDOWS_TASK_LIVE_PENDING automated_run_seconds=144.950
```

## Detailed evidence

```text
focused_product=9/9 PASS
affected_regression=56/56 PASS
governance=115/115 PASS
canonical=126 files / 8 batches / 688/688 PASS / skipped 0
source_version=36 manifests / 35 sources / 3 Host literals
workspace_lock=36 importers / 92 dependencies
workspace_links=89 edges / 35 materialized package scopes / root scope present
source_root_archive_count=0
architecture=35 packages / 89 edges / 150 sources / Vue 3
exports=35/35 PASS
manifest=1432/1432 PASS with this evidence file included
```

The document-inclusive rerun preserved all Product, regression, governance and canonical totals and passed the regenerated 1432/1432 package manifest. Its machine report is generated under `.artifacts/acceptance/` and is intentionally excluded from the source package.

The focused integration uses actual SQLite, authenticated local protocol dispatch, Host lifecycle, Conversation, Delegation, Automation and the new Task service with scripted local model adapters. It proves one Task per Run, stable Task identity across Host restart without client resubmission, terminal lifecycle monotonicity, delegated parent Task linkage, Automation reclassification without duplication, and replay-safe cancellation delegated to the owning Run/runtime.

The canonical suite initially exposed a stale exact Local Protocol operation list even though the production registry advertised the new Task operations. That independent failure is retained as `OR-ISSUE-236`; after correction, the complete canonical suite passed 688/688 with zero skips.

## Environment and deliberate exclusions

```text
provider=SCRIPTED_LOCAL
external_model=NOT_RUN
browser_live=NOT_RUN
connector=DEFERRED_NO_REAL_SYSTEM
windows_task_live=PENDING_ENV
online_package_manager_install=NOT_CLAIMED
```

## Promotion status

```text
source_package=ACCEPTED
promotion=WINDOWS_TASK_LIVE_PENDING
live_harness=STEP020A_H1_DURABLE_TASK_PROTOCOL_RESTART_AND_CANCELLATION
```

Windows promotion requires the packaged ZIP to pass the actual Windows SQLite/protocol/Host lifecycle Harness after `pnpm install --frozen-lockfile`. Local source/package acceptance does not promote STEP020A over the accepted STEP019B Product baseline.

## Failure assets

- `OR-ISSUE-233`: offline Corepack/pnpm registry bootstrap failure.
- `OR-ISSUE-234`: current-root package exports had no built `dist` bootstrap.
- `OR-ISSUE-235`: mandatory TaskService injection broke retained Automation callers.
- `OR-ISSUE-236`: Local Protocol capability contract omitted the new Task operations.
