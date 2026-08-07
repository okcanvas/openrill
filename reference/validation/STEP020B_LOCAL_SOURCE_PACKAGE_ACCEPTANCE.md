# STEP020B Local Source and Package Acceptance

## Candidate identity

```text
step=STEP020B_DURABLE_TASK_FLOW_REGISTRY_AND_CONTROLLER_LIFECYCLE_FOUNDATION
version=0.20.1-step020b
state_schema=19
accepted_product_baseline=STEP020A_DURABLE_BACKGROUND_TASK_LEDGER_AND_RUNTIME_LIFECYCLE_FOUNDATION
accepted_checks=40/40
accepted_sha256=67ac1fa4a5067ff3070f0a990bfdfd262a6d956961ebd221432cdacf567c9a7f
```

## Document-inclusive complete source/package aggregate

```text
STEP020B_DURABLE_TASK_FLOW_REGISTRY_AND_CONTROLLER_LIFECYCLE_FOUNDATION checks=36/36 state=PASSED version=0.20.1-step020b schema=19 accepted_product_baseline=STEP020A_DURABLE_BACKGROUND_TASK_LEDGER_AND_RUNTIME_LIFECYCLE_FOUNDATION accepted_checks=40/40 task_flow=CONTROLLER_OWNED_REGISTRY revision=OPTIMISTIC_CAS wait=WAITING_BLOCKED_RESUME tasks=ONE_FLOW_MANY_TASKS restart=FLOW_IDENTITY_STABLE cancellation=CHILD_TASK_CASCADE terminal=MONOTONE executor=DEFERRED openclaw_reference=TASK_FLOW_SOURCE_AUDITED external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM focused_product=6 affected_regression=73 governance=127 canonical_files=130 canonical_tests=706 windows_task_flow_live=PENDING_ENV live_harness=STEP020B_H1_TASK_FLOW_PROTOCOL_RESTART_REVISION_AND_CANCELLATION promotion=WINDOWS_TASK_FLOW_LIVE_PENDING automated_run_seconds=145.336
```

## Detailed evidence

```text
focused_product=6/6 PASS
affected_regression=73/73 PASS
governance=127/127 PASS
canonical=130 files / 9 batches / 706/706 PASS / skipped 0
source_version=37 manifests / 36 sources / 3 Host literals
workspace_lock=37 importers / 95 dependencies
workspace_links=92 edges / 36 materialized package scopes / root scope present
source_root_archive_count=0
architecture=36 packages / 92 edges / 156 sources / Vue 3
exports=36/36 PASS
```

The complete pipeline was rerun after this evidence file and the final continuation status were written.
The document-inclusive source tree passed the regenerated 1455/1455 package manifest at both the initial
and final manifest stages. Machine stage logs remain under `.artifacts/acceptance/` and are intentionally
excluded from the immutable source ZIP.

The focused evidence uses actual SQLite, the authenticated Local Protocol and real Agent Host lifecycle.
It proves controller-owned Flow identity, expected-revision conflicts, waiting/blocked/resume persistence,
one Flow linked to several Tasks, one Task linked to at most one Flow, Host restart identity stability and
cancellation cascading through child Tasks to their owning Runs.

## Environment and deliberate exclusions

```text
provider=SCRIPTED_LOCAL
executor=DEFERRED_NO_AUTONOMOUS_PLAN_TO_TASK
external_model=NOT_RUN
browser_live=NOT_RUN
connector=DEFERRED_NO_REAL_SYSTEM
windows_task_flow_live=PENDING_ENV
```

## Promotion status

```text
source_package=ACCEPTED
promotion=WINDOWS_TASK_FLOW_LIVE_PENDING
live_harness=STEP020B_H1_TASK_FLOW_PROTOCOL_RESTART_REVISION_AND_CANCELLATION
```

Linux source/package evidence cannot promote STEP020B over the accepted STEP020A Product baseline.
Windows promotion requires `pnpm install --frozen-lockfile` followed by
`pnpm acceptance:step020b:live` on the immutable packaged source.

## Failure assets

- `OR-ISSUE-237`: Task Flow workspace FK exceeded the accepted runtime ownership contract.
- `OR-ISSUE-238`: the first canonical run found retained `OR-ISSUE-213` missing from current continuation documents.
- `OR-ISSUE-239`: the second canonical run found retained `OR-ISSUE-214`/H2 privacy identity missing from the same assets.
