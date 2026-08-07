# STEP019B Local Source and Package Acceptance

## Candidate identity

```text
step=STEP019B_DETACHED_RUN_AND_HOST_RESTART_AUTO_RESUME_FOUNDATION
version=0.19.1-step019b
state_schema=17
accepted_product_baseline=STEP019A_DURABLE_GOAL_PLAN_AND_LONG_RUNNING_TASK_STATE
accepted_checks=38/38
accepted_sha256=453eb9166858e4766343edec74a33b01d64b15b5e48decff7bb03d2f092368e6
```

## Document-inclusive source/package aggregate

```text
STEP019B_DETACHED_RUN_AND_HOST_RESTART_AUTO_RESUME_FOUNDATION checks=35/35 state=PASSED version=0.19.1-step019b schema=17 accepted_product_baseline=STEP019A_DURABLE_GOAL_PLAN_AND_LONG_RUNNING_TASK_STATE accepted_checks=38/38 detached=PROTOCOL_ACK_FIRST restart=HOST_AUTO_RESUME checkpoint=TOOL_EXACTLY_ONCE attempt=FRESH_BEFORE_PREPARATION cancellation=OPERATOR_TERMINAL recovery=CHECKPOINT_FAIL_CLOSED provenance=WORKSPACE_CONVERSATION_RUN_ATTEMPT external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM focused_product=6 affected_regression=29 governance=104 canonical_files=121 canonical_tests=668 windows_detached_live=PENDING_ENV live_harness=STEP019B_H1_DETACHED_PROTOCOL_HOST_RESTART_AUTO_RESUME promotion=WINDOWS_DETACHED_LIVE_PENDING automated_run_seconds=129.938
```

## Detailed evidence

```text
focused_product=6/6 PASS
affected_regression=29/29 PASS
governance=104/104 PASS
canonical=121 files / 8 batches / 668/668 PASS / skipped 0
source_version=35 manifests / 34 sources / 3 Host literals
workspace_lock=35 importers / 90 dependencies
workspace_links=87 edges / 34 materialized package scopes / root scope present
source_root_archive_count=0
architecture=34 packages / 87 edges / 144 sources / Vue 3
exports=34/34 PASS
manifest=1407/1407 PASS with this evidence file included
```

The focused integration uses actual SQLite, authenticated protocol dispatch, Host lifecycle, Agent Kernel, Goal service and Tool registry with scripted local model adapters. It closes and reopens the Host, issues no second `conversation.send` or `conversation.execute`, and verifies that the same Run completes under Attempt 2 while the completed Tool effect remains exactly once.

The document-inclusive source/package rerun preserved the same Product, regression, governance and canonical totals and passed the regenerated 1407/1407 package manifest. Its machine report is generated under `.artifacts/acceptance/` and is intentionally not required as a packaged build artifact.

## Environment and deliberate exclusions

```text
provider=SCRIPTED_LOCAL
external_model=NOT_RUN
browser_live=NOT_RUN
connector=DEFERRED_NO_REAL_SYSTEM
windows_detached_live=PENDING_ENV
```

## Promotion status

```text
source_package=ACCEPTED
promotion=WINDOWS_DETACHED_LIVE_PENDING
live_harness=STEP019B_H1_DETACHED_PROTOCOL_HOST_RESTART_AUTO_RESUME
```

Windows promotion requires the packaged ZIP to pass the real Windows SQLite/Host restart Harness. Local source acceptance does not promote STEP019B over the accepted STEP019A Product baseline.

## Failure assets

- `OR-ISSUE-230`: normal Host shutdown was indistinguishable from operator cancellation.
- `OR-ISSUE-231`: recovered durable root Runs were classified but not startup-scheduled.
- `OR-ISSUE-232`: recovered Goal/Skill preparation could use stale aborted Attempt provenance.
