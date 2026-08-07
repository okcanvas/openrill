<!-- STEP023AR1_GITHUB_PUBLISHING_START -->
# GitHub Publishing Corrective — STEP023AR1

```text
CORRECTIVE=STEP023AR1_GITHUB_PUBLISHING_SOURCE_HYGIENE_AND_EOL_CONTRACT_CLOSURE
PRODUCT_STEP=STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE
PRODUCT_VERSION=0.25.0-step023a
STATE_SCHEMA=26
PRODUCT_RUNTIME_MODIFICATIONS=0
GITHUB_PRIVATE_READY=YES
PUBLIC_OPEN_SOURCE_LICENSE=NOT_SELECTED
GIT_EOL=REPOSITORY_OWNED
SECRET_IGNORE=ENV_FAMILY_AND_KEY_FILES
```

GitHub publication is now treated as a source-transport boundary rather than a manual upload. `.gitattributes` preserves package bytes by default and the CRLF-only root Windows CMD contract closed by STEP022CR3, `.gitignore` covers the broader local-secret filename family, and `GITHUB_PUBLISHING.md` owns the exact first-push and visibility rules. No OpenRill license is inferred from the MIT license recorded for referenced OpenClaw source. Product runtime semantics, schema 26, STEP023A source identity, accepted Product baseline, and Mattermost LIVE_PENDING status are unchanged.

Continuation for publication: `GITHUB_PUBLISHING.md`, `reference/validation/STEP023AR1_GITHUB_PUBLISHING_READINESS_AUDIT.md`, then OR-ISSUE-405 through OR-ISSUE-410.
<!-- STEP023AR1_GITHUB_PUBLISHING_END -->

<!-- STEP023A_CURRENT_START -->
# Current Source Candidate — STEP023A Periodic Maintenance Physical Retention and Prune

```text
STEP=STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE
VERSION=0.25.0-step023a
STATE_SCHEMA=26
SOURCE_PACKAGE=LOCAL_SOURCE_ACCEPTED
PROMOTION=WINDOWS_MAINTENANCE_RETENTION_LIVE_PENDING
OFFICIAL_PRODUCT_BASELINE=STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE
ACCEPTED_BASELINE_VERSION=0.21.3-step021br2
ACCEPTED_BASELINE_CHECKS=82/82
MATTERMOST_CONNECTOR=PREPARING_LIVE_PENDING_NON_BLOCKING
MAINTENANCE=HOST_OWNED_PERIODIC
OWNERSHIP=DURABLE_LEASE
CURSOR=PERSISTED_RESTART_CONTINUATION
PRUNE=PROTECTION_RECHECK_TOMBSTONE_FIRST
AMBIGUOUS_CONNECTOR_HISTORY=NO_AUTOMATIC_PRUNE
NEXT_PLANNED=STEP023B_STATE_BACKUP_QUARANTINE_REPAIR_AND_RESTORE_DRILL
```

STEP023A closes physical retention for terminal Task, Task Flow and safe Connector-delivery history without creating another executor. Retention scheduling is separated from reconciliation; a due timestamp alone never permits deletion; the State repository rechecks active/unresolved references inside the delete transaction; a minimal hashed tombstone is inserted before cascade deletion; durable leases prevent concurrent owners; and a persisted deterministic sweep cursor prevents protected-prefix starvation across intervals and Host restart. Local Protocol exposes closed preview, prune and tombstone reads. Mattermost STEP022C remains preserved as PREPARING/LIVE_PENDING and does not block this independent maintenance step. The official Product baseline remains STEP021BR2 until a later candidate passes its required Windows promotion gate.

Continuation order for this candidate: `HANDOFF.md`, `docs/plans/STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE.md`, `docs/contracts/MAINTENANCE_RETENTION.md`, `docs/research/STEP023A_OPENCLAW_MAINTENANCE_REFERENCE_AUDIT.md`, `reference/validation/STEP023A_LOCAL_SOURCE_PACKAGE_ACCEPTANCE.md`, then OR-ISSUE-376 onward. Any older section labelled current below this block is historical retained evidence and must not reclaim current source identity.
<!-- STEP023A_CURRENT_END -->

<!-- STEP022CR2_SUPPORT_START -->
# Current Validation/Packaging Corrective — STEP022CR2 Integrated Mattermost Testbed Single-Root Bootstrap

```text
STEP=STEP022CR2_INTEGRATED_MATTERMOST_TESTBED_SINGLE_ROOT_BOOTSTRAP
PRODUCT_STEP=STEP022C_MATTERMOST_REAL_CONNECTOR_DURABLE_VERTICAL_SLICE
PRODUCT_VERSION=0.24.0-step022c
STATE_SCHEMA=25
PRODUCT_RUNTIME_MODIFICATIONS=0
TESTBED=INTEGRATED_UNDER_testbeds/mattermost
WORKING_ROOT=SELF_DERIVED
EXTERNAL_OPENRILL_ROOT_ARGUMENT=FORBIDDEN
CMD_ENTRYPOINT=start-and-run-step022c-live.cmd
POWERSHELL_ENTRYPOINT=start-and-run-step022c-live.ps1
MATTERMOST_IMAGE=mattermost/mattermost-team-edition:11.7.7
POSTGRES_IMAGE=postgres:18-alpine
LOCAL_SUPPORT_ACCEPTANCE=STAGED_EXACT_ACCEPTED
STEP022C_FOCUSED=24/24
STEP022CR2_FOCUSED=12/12
RETAINED_PRODUCT=61/61
AFFECTED_REGRESSION=23/23
GOVERNANCE=243/243
CANONICAL=183 files / 957/957 tests
ARCHITECTURE=37 packages / 99 edges / 186 sources
EXPORTS=37/37
DOCKER_LIVE=NOT_RUN_IN_PACKAGING_ENV
STEP022C_WINDOWS_LIVE=PENDING_REAL_LOCAL_DOCKER
OFFICIAL_PRODUCT_BASELINE=STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE
```

The prior separate Testbed ZIP required a second project directory and a mandatory `-OpenRillRoot` argument. That packaging contract was wrong for the actual one-root workflow. STEP022CR2 keeps all STEP022C Product code and schema unchanged, embeds the real Mattermost Docker Testbed in this source tree, and makes the repository root itself the only OpenRill working directory. On Windows CMD run `start-and-run-step022c-live.cmd`; on PowerShell run `.\start-and-run-step022c-live.ps1`. No path argument is accepted.

Evidence: `docs/plans/STEP022CR2_INTEGRATED_MATTERMOST_TESTBED_SINGLE_ROOT_BOOTSTRAP.md`, `testbeds/mattermost/README.md`, and OR-ISSUE-366 through OR-ISSUE-370.
<!-- STEP022CR2_SUPPORT_END -->

<!-- STEP022C_CURRENT_START -->
# Current Candidate — STEP022C Mattermost Real Connector Durable Vertical Slice

```text
STEP=STEP022C_MATTERMOST_REAL_CONNECTOR_DURABLE_VERTICAL_SLICE
VERSION=0.24.0-step022c
STATE_SCHEMA=25
SOURCE_PACKAGE=LOCAL_SOURCE_ACCEPTED
PROMOTION=WINDOWS_MATTERMOST_REAL_LIVE_PENDING
OFFICIAL_PRODUCT_BASELINE=STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE
ACCEPTED_BASELINE_VERSION=0.21.3-step021br2
ACCEPTED_CHECKS=82/82
ACCEPTED_ZIP_SHA256=4f763933b37235b2ed7f87f1c1922fc934fdf80bb4135b8e37b12b274f1a1ed5
MATTERMOST=REAL_REST_WEBSOCKET
ROUTING=DM_MENTION_THREAD
INGRESS=PERSIST_BEFORE_ACK
EXECUTION=ADOPTED_RUN_SCHEDULED
DELIVERY=TERMINAL_RUN_TO_RECEIPT
AMBIGUITY=MAYBE_ACCEPTED_NO_REPLAY
DOCTOR=REST_AND_WEBSOCKET_AUTH_PROBE
RESTART=REMOTE_REPLY_DUPLICATE_FREE
EXTENSION=DYNAMIC_IMPORT_SECRETREF
PROTOCOL=REDACTED_STATUS_DOCTOR
MODEL=SCRIPTED_LOCAL
FOCUSED_MATTERMOST=24/24
RETAINED_PRODUCT=61/61
AFFECTED_REGRESSION=23/23
GOVERNANCE=241/241
CANONICAL=181 files / 945/945 tests
ARCHITECTURE=37 packages / 99 edges / 186 sources
EXPORTS=37/37
MANIFEST=1882/1882
LOCAL_ACCEPTANCE=32/32 PASSED
RECORDED_AUTOMATED_RUN_SECONDS=80.177
FINAL_RECORD_STATE_RECHECK=32/32 PASSED
WINDOWS_LIVE=PENDING_ENV
LIVE_HARNESS=STEP022C_H1_REAL_MATTERMOST_DM_MENTION_THREAD_DELIVERY_AND_RESTART
```

STEP022C turns the schema-25 durable Connector runtime into one real Mattermost vertical slice. The packaged Extension authenticates through REST, receives posted events over WebSocket, routes DM/channel mentions and threads, persists ingress before adoption, schedules the created Run in the Agent coordinator, projects terminal assistant output to one durable delivery, stores the exact Mattermost receipt, and recovers without duplicate durable or remote replies. Attachments, reactions, streaming edits, multi-account policy, rate-limit coordination, and operator dead-letter replay remain deferred.

Continuation order: read `HANDOFF.md`, `docs/plans/STEP022C_MATTERMOST_REAL_CONNECTOR_DURABLE_VERTICAL_SLICE.md`, `docs/contracts/MATTERMOST_CONNECTOR.md`, `docs/research/STEP022C_OPENCLAW_MATTERMOST_CONNECTOR_AUDIT.md`, and `reference/validation/STEP022C_LOCAL_SOURCE_PACKAGE_ACCEPTANCE.md`.
<!-- STEP022C_CURRENT_END -->

<!-- STEP022B_HISTORY_START -->
# Historical Local Candidate — STEP022B Durable Connector Runtime, Ingress, Delivery and Binding

```text
STEP=STEP022B_DURABLE_CONNECTOR_RUNTIME_INGRESS_DELIVERY_AND_BINDING
VERSION=0.23.0-step022b
STATE_SCHEMA=25
SOURCE_PACKAGE=LOCAL_SOURCE_ACCEPTED
PROMOTION=WINDOWS_CONNECTOR_RUNTIME_LIVE_PENDING
OFFICIAL_PRODUCT_BASELINE=STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE
ACCEPTED_BASELINE_VERSION=0.21.3-step021br2
ACCEPTED_CHECKS=82/82
ACCEPTED_ZIP_SHA256=4f763933b37235b2ed7f87f1c1922fc934fdf80bb4135b8e37b12b274f1a1ed5
INGRESS=PERSIST_BEFORE_ACK
BINDING=ATOMIC_CONVERSATION_MESSAGE_RUN
DELIVERY=CLAIM_DISPATCH_RECEIPT
UNCERTAIN=NO_AUTOMATIC_REPLAY
EXTENSION=HOST_REGISTERED_ADAPTER
PROTOCOL=REDACTED_LEDGER_READ
RESTART=SAFE_RECLAIM_AND_UNCERTAIN_ISOLATION
MATTERMOST=DEFERRED_STEP022C
FOCUSED_CONNECTOR=21/21
RETAINED_PRODUCT=40/40
AFFECTED_REGRESSION=23/23
GOVERNANCE=230/230
CANONICAL=173 files / 910/910 tests
ARCHITECTURE=37 packages / 99 edges / 179 sources
EXPORTS=37/37
MANIFEST=1744/1744
LOCAL_ACCEPTANCE=32/32 PASSED
WINDOWS_LIVE=PENDING_ENV
LIVE_HARNESS=STEP022B_H1_DURABLE_CONNECTOR_INGRESS_DELIVERY_RECEIPT_AND_RESTART
```

STEP022B replaces the Connector identity stub with schema-25 durable account, binding, ingress, logical delivery, attempt, provider receipt and dead-letter ledgers. External events are persisted before acknowledgement; first binding plus Conversation/Message/Run admission is atomic; possible provider acceptance is quarantined as UNCERTAIN without automatic replay. Connector Extensions register real Host-owned adapters through the STEP022A contract. This step does not claim a real Mattermost transport; that remains STEP022C.
<!-- STEP022B_HISTORY_END -->

<!-- STEP021BR2_CURRENT_START -->
# Current Candidate — STEP021BR2 Windows TAP Summary Parser Closure

```text
STEP=STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE
VERSION=0.21.3-step021br2
STATE_SCHEMA=24
SOURCE_PACKAGE=CODE_LEVEL_ACCEPTED
PROMOTION=WINDOWS_TAP_SUMMARY_LIVE_PENDING
OFFICIAL_PRODUCT_BASELINE=STEP021A_DURABLE_GOAL_PLAN_TO_TASK_FLOW_EXECUTOR_FOUNDATION
ACCEPTED_CHECKS=58/58
PARENT_FAILURE=STEP021BR1 67/68 FAILED / INNER 20/24 FAILED
FOCUSED_PRODUCT_EVIDENCE=22/22 PASSED
FAILURE_CLASS=ACCEPTANCE_HARNESS_ONLY
ISSUE=OR-ISSUE-306
LIVE_HARNESS=STEP021BR2_H1_WINDOWS_TAP_SUMMARY_PARSER_AND_PLAN_REVISION_RESTART
LOCAL_ACCEPTANCE=81/81 PASSED
HARNESS_REGRESSION=4/4
FOCUSED_PRODUCT=22/22
AFFECTED_REGRESSION=116/116
GOVERNANCE=210/210
CANONICAL=163 files / 855/855 tests
MANIFEST=1667/1667
ARCHITECTURE=37 packages / 98 edges / 168 sources
EXPORTS=37/37
RECORDED_AUTOMATED_RUN_SECONDS=94.932
FINAL_RECORD_STATE_RECHECK=81/81 PASSED
```

Actual Windows STEP021BR1 completed all 22 focused Goal/Plan revision Product tests, including changed-Step Host restart, but four TAP summary counts were `-1`. Code review proved the dynamic JavaScript `RegExp` string consumed the numeric escape and produced `(d+)`. STEP021BR2 replaces it with a shared structured line parser, covers LF and Windows CRLF, keeps missing values fail-closed, and repairs the historical STEP021BR1 Harness. Product behavior and schema 24 are unchanged.

Windows transition command: `pnpm install --frozen-lockfile` then `pnpm acceptance:step021br2:live`. Until 28/28 Windows Live passes, STEP021A remains the official Product baseline. Evidence: `reference/validation/STEP021BR1_WINDOWS_TAP_SUMMARY_PARSER_FAILURE.md`; plan: `docs/plans/STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE.md`; recurrence: `reference/validation/STEP021BR2_OR_ISSUE_306.md`.
<!-- STEP021BR2_CURRENT_END -->

<!-- STEP021BR1_CURRENT_START -->
# Current Corrective Candidate — STEP021BR1 Plan Revision Stable-Step Identity and Open-Blocker Guard Closure

```text
STEP=STEP021BR1_PLAN_REVISION_STABLE_STEP_IDENTITY_AND_OPEN_BLOCKER_GUARD_CLOSURE
VERSION=0.21.2-step021br1
STATE_SCHEMA=24
SOURCE_PACKAGE=CODE_LEVEL_ACCEPTED
LOCAL_CHECKS=67/67
FOCUSED_PRODUCT=22/22
AFFECTED_REGRESSION=116/116
GOVERNANCE=201/201
CANONICAL=161 files / 842 tests
MANIFEST=1654/1654
ARCHITECTURE=37 packages / 98 edges / 168 sources
EXPORTS=37/37
RECORDED_AUTOMATED_RUN_SECONDS=208.088
LOCAL_TOOLCHAIN=Node_22.16.0 + TypeScript_5.8.3_compatibility
PNPM_FROZEN_INSTALL=NOT_RUN_NO_REGISTRY_ACCESS
PROMOTION=WINDOWS_PLAN_REVISION_CORRECTIVE_LIVE_PENDING
WINDOWS_PLAN_REVISION_CORRECTIVE_LIVE=PENDING_ENV
LIVE_HARNESS=STEP021BR1_H1_CHANGED_STEP_REEXECUTION_MUTABLE_ISOLATION_OPEN_BLOCKER_AND_RESTART
OFFICIAL_PRODUCT_BASELINE=STEP021A_DURABLE_GOAL_PLAN_TO_TASK_FLOW_EXECUTOR_FOUNDATION
ACCEPTED_VERSION=0.21.0-step021a
ACCEPTED_SCHEMA=23
ACCEPTED_CHECKS=58/58
ACCEPTED_ZIP=openrill-step021a-durable-goal-plan-task-flow-executor-foundation-v1.zip
ACCEPTED_SHA256=6193888a454807a65603616fcef146b150e83b18ebc0060e7a577cbd425821fc
ACCEPTED_EVIDENCE=reference/validation/STEP021A_WINDOWS_GOAL_PLAN_EXECUTOR_LIVE_ACCEPTANCE.md
```

STEP021BR1 closes the pre-Windows-Live audit findings OR-ISSUE-303 through OR-ISSUE-305. Stable completion now requires semantic immutable Step equality; changed/new Steps receive fresh execution history; an older pinned execution cannot project completion into a changed current Plan Step; and adoption uses an unbounded open-blocker existence query. The Host restart contract re-executes a changed completed Step and finishes with exactly four unique child Tasks.

The complete local aggregate passed under the available Node 22.16.0 and TypeScript 5.8.3 compatibility toolchain. The exact `pnpm install --frozen-lockfile` path remains a required Windows acceptance step because pnpm 11.15.1 was not locally cached and registry access was unavailable.

Plan: `docs/plans/STEP021BR1_PLAN_REVISION_STABLE_STEP_IDENTITY_AND_OPEN_BLOCKER_GUARD_CLOSURE.md`. Audit: `reference/validation/STEP021B_PRE_WINDOWS_LIVE_CODE_AUDIT.md`. Local evidence: `reference/validation/STEP021BR1_LOCAL_SOURCE_PACKAGE_ACCEPTANCE.md`. Failure prevention: `OR-ISSUE-303` through `OR-ISSUE-305`.
<!-- STEP021BR1_CURRENT_END -->

# STEP020ER3_WINDOWS_PYTHON_LIVE_MARKER_VALIDATOR_ENTRYPOINT_CLOSURE current source/package corrective candidate

```text
step=STEP020ER3_WINDOWS_PYTHON_LIVE_MARKER_VALIDATOR_ENTRYPOINT_CLOSURE
version=0.20.8-step020er3
state_schema=22
source_package=ACCEPTED
promotion=WINDOWS_PYTHON_VALIDATOR_LIVE_PENDING
accepted_product_baseline=STEP020D_TASK_AND_TASK_FLOW_RECONCILIATION_LOST_AND_RETENTION_FOUNDATION
accepted_version=0.20.4-step020d
accepted_checks=53/53
accepted_zip_sha256=5a3b83b35e52176fad6b5525991e2da7eaf1ab16aac25c566d4a63027518b450
windows_python_validator_live=PENDING_ENV
live_harness=STEP020ER3_H1_WINDOWS_PYTHON_VALIDATOR_ENTRYPOINT_AND_COMPLETION
local_checks=65/65
focused_product=20/20
affected_regression=99/99
governance=175/175
canonical=151 files / 794 tests
manifest=1574/1574
architecture=36 packages / 93 edges / 163 sources
exports=36/36
automated_run_seconds=72.767
```

The actual STEP020ER2 Windows run failed `STEP020ER2 54/57 Windows LIVE FAILED`: focused Product was 14/16, canonical stopped at the same test, and the inner Harness was 20/23. All Product completion, retry, controller wake, Host restart and schema-backfill scenarios passed. The two failures were `ModuleNotFoundError: No module named 'scripts.step020er2_live_marker'` from a Node test that launched `python -c` and assumed caller cwd/PYTHONPATH semantics.

STEP020ER3 removes that assumption. Python validation is an explicit absolute file entrypoint with `--validate-stdin`; Node paths use `fileURLToPath`; external cwd, spaces, and a shadow `scripts` package are tested. The structured field-set marker contract remains intact. No Local Protocol retry, completion delivery, Task, Flow, Run, Host lifecycle or State schema Product behavior changes. `OR-ISSUE-272` records the failure and correction; `OR-ISSUE-273` preserves the exact failed-state evidence.

Evidence: `reference/validation/STEP020ER2_WINDOWS_PYTHON_VALIDATOR_ENTRYPOINT_FAILURE.md`, `reference/validation/STEP020ER3_OR_ISSUE_272.md`, `docs/plans/STEP020ER3_WINDOWS_PYTHON_LIVE_MARKER_VALIDATOR_ENTRYPOINT_CLOSURE.md`, and `reference/validation/STEP020ER3_LOCAL_SOURCE_PACKAGE_ACCEPTANCE.md`.

Autonomous Plan execution, physical prune, periodic/distributed sweeping, external model, Browser LIVE and real Connector remain deferred. Mattermost and Connector work remains speculative until a concrete adapter and executable real API/event environment exist.

---

## Retained prior continuation

# STEP020ER2_WINDOWS_COMPLETION_LIVE_MARKER_CONTRACT_ALIGNMENT current source/package accepted corrective candidate

```text
step=STEP020ER2_WINDOWS_COMPLETION_LIVE_MARKER_CONTRACT_ALIGNMENT
version=0.20.7-step020er2
state_schema=22
source_package=ACCEPTED
local_checks=56/56
focused_product=16/16
affected_regression=99/99
governance=168/168
canonical=149 files / 783 tests
manifest=1560/1560
architecture=36 packages / 93 edges / 163 sources
exports=36/36
promotion=WINDOWS_COMPLETION_MARKER_LIVE_PENDING
accepted_product_baseline=STEP020D_TASK_AND_TASK_FLOW_RECONCILIATION_LOST_AND_RETENTION_FOUNDATION
accepted_version=0.20.4-step020d
accepted_checks=53/53
accepted_zip_sha256=5a3b83b35e52176fad6b5525991e2da7eaf1ab16aac25c566d4a63027518b450
windows_completion_marker_live=PENDING_ENV
live_harness=STEP020ER2_H1_WINDOWS_COMPLETION_LIVE_MARKER_CONTRACT_ALIGNMENT
automated_run_seconds=68.940
```

The actual STEP020ER1 Windows run proved the Product path: its Windows stage returned PASS and the inner Harness passed 21/21, including the queued controller wake restart scenario. The aggregate nevertheless reported `STEP020ER1 59/60 Windows LIVE FAILED` because its independently copied exact marker required `queue=SYSTEM_MESSAGE_WAKE_RUN` and `migration=TERMINAL_CHILD_SAFE_BACKFILL`, while the live runner omitted those two tokens.

STEP020ER2 is an evidence-contract correction only. `config/step020er2-live-marker-contract.json` is the single source for marker identity and fields. The Windows runner renders from it and the aggregate validates one key/value field set independent of ordering. Missing, extra, duplicate or changed fields fail explicitly. No Local Protocol retry, completion delivery, Task, Flow, Run, Host lifecycle or schema Product behavior is changed. `OR-ISSUE-270` records the marker mismatch and `OR-ISSUE-271` records the historical-governance ownership recurrence.

Evidence: `reference/validation/STEP020ER1_WINDOWS_LIVE_MARKER_CONTRACT_FAILURE.md`, `reference/validation/STEP020ER2_OR_ISSUE_270.md`, `reference/validation/STEP020ER2_OR_ISSUE_271.md`, and `reference/validation/STEP020ER2_LOCAL_SOURCE_PACKAGE_ACCEPTANCE.md`.

Autonomous Plan execution, physical prune, periodic/distributed sweeping, external model, Browser LIVE and real Connector remain deferred. Mattermost and Connector work remains speculative until a concrete adapter and executable real API/event environment exist.

---
# STEP020E_DURABLE_TASK_COMPLETION_DELIVERY_CONTROLLER_WAKE_AND_REQUIRED_COMPLETION_SEMANTICS current source/package accepted candidate

```text
step=STEP020E_DURABLE_TASK_COMPLETION_DELIVERY_CONTROLLER_WAKE_AND_REQUIRED_COMPLETION_SEMANTICS
version=0.20.5-step020e
state_schema=22
source_package=ACCEPTED
local_checks=49/49
focused_product=10/10
affected_regression=99/99
governance=162/162
canonical=145 files / 771 tests
manifest=1538/1538
architecture=36 packages / 93 edges / 163 sources
exports=36/36
promotion=WINDOWS_COMPLETION_LIVE_PENDING
accepted_product_baseline=STEP020D_TASK_AND_TASK_FLOW_RECONCILIATION_LOST_AND_RETENTION_FOUNDATION
accepted_version=0.20.4-step020d
accepted_checks=53/53
accepted_zip_sha256=5a3b83b35e52176fad6b5525991e2da7eaf1ab16aac25c566d4a63027518b450
windows_completion_live=PENDING_ENV
live_harness=STEP020E_H1_DURABLE_COMPLETION_DELIVERY_CONTROLLER_WAKE_RESTART_AND_SEMANTICS
automated_run_seconds=62.143
```

STEP020E closes the durable continuation path from a terminal managed child Task to its Conversation-owned controller. Task terminal projection and one delivery intent commit atomically; the owner system message, silent controller wake Run, wake Task and delivery binding commit atomically before the existing Run coordinator schedules execution. Exact replay and Host restart preserve identity, and a delivery is complete only after a successful bound `task_flow` decision. Empty or progress-only output is `terminalOutcome=BLOCKED`; Flow outcome remains controller-owned. Autonomous Goal Plan-to-Task execution remains deferred.

Code-grounded evidence: `docs/research/STEP020E_OPENCLAW_COMPLETION_DELIVERY_AND_CONTROLLER_WAKE_AUDIT.md`, `docs/plans/STEP020E_DURABLE_TASK_COMPLETION_DELIVERY_CONTROLLER_WAKE_AND_REQUIRED_COMPLETION_SEMANTICS.md`, `reference/validation/STEP020D_WINDOWS_MAINTENANCE_LIVE_ACCEPTANCE.md`, `reference/validation/STEP020E_LOCAL_SOURCE_PACKAGE_ACCEPTANCE.md`, and independent failure assets OR-ISSUE-259 through OR-ISSUE-268. Retained continuity includes OR-ISSUE-213, OR-ISSUE-214, OR-ISSUE-238, OR-ISSUE-239, OR-ISSUE-247, and OR-ISSUE-251.

Mattermost and Connector work remains speculative and deferred until a concrete real adapter contract and executable real API/event environment exist. No fake surface is promoted as real integration evidence. Plugin runtime is deferred; no Plugin marketplace or remote plugin installation is claimed.

---
# OpenRill STEP020B Handoff

## Constitutional rule

Never infer Product behavior from names or plans. Inspect actual code, tests and execution evidence. Every newly observed failure receives an independent issue record and recurrence gate. This repository must remain sufficient to continue from the ZIP alone.

## Current candidate

```text
step=STEP020B_DURABLE_TASK_FLOW_REGISTRY_AND_CONTROLLER_LIFECYCLE_FOUNDATION
version=0.20.1-step020b
state_schema=19
source_package_status=ACCEPTED
windows_task_flow_live=PENDING
live_harness=STEP020B_H1_TASK_FLOW_PROTOCOL_RESTART_REVISION_AND_CANCELLATION
```

## Accepted Product baseline

```text
step=STEP020A_DURABLE_BACKGROUND_TASK_LEDGER_AND_RUNTIME_LIFECYCLE_FOUNDATION
version=0.20.0-step020a
state_schema=18
checks=40/40
windows_task_live=PASSED
artifact=openrill-step020a-durable-background-task-ledger-runtime-lifecycle-foundation-v1.zip
sha256=67ac1fa4a5067ff3070f0a990bfdfd262a6d956961ebd221432cdacf567c9a7f
```

The operator-supplied Windows marker is retained verbatim at `reference/validation/STEP020A_WINDOWS_TASK_LIVE_ACCEPTANCE.md`.

## Reference implementation audit

`openclaw-main.zip` version `2026.7.2`, SHA-256 `1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82`, was audited as the answer key. Actual Task Flow registry, SQLite store, owner access, controller runtime, executor, audit, maintenance and tests were inspected.

Code-confirmed separation:

```text
Goal/Plan = durable intent and ordered proposal
Task = one Run-linked execution fact
Task Flow = controller-owned orchestration state over multiple Tasks
Run/runtime = actual execution and cancellation authority
```

OpenClaw confirms durable Flow identity, revision conflict detection, waiting/blocked/resume, `Task.parentFlowId`, cancellation request before child drain, owner scoping and independent maintenance. OpenRill represents the one-Flow-many-Tasks link in `task_flow_tasks` with unique `task_id`.

## Implemented STEP020B Product boundary

- migration 019: `task_flows`, `task_flow_tasks`, `task_flow_events`;
- `StateTaskFlowRepository` wired into State repositories;
- new package `@openrill/task-flows`;
- controller-owned create, link, start, wait, block, resume, success, failure and cancellation lifecycle;
- expected-revision CAS for non-replay mutations;
- stable Flow ID/revision/state over Host restart;
- one Task may belong to only one Flow; one Flow may link several Tasks;
- terminal lifecycle is monotone;
- cancellation records `cancelRequestedAt`, delegates to each child Task and therefore its owning Run, then finalizes;
- replay-safe terminal cancellation;
- public Local Protocol is exactly `taskFlow.list`, `taskFlow.get`, `taskFlow.cancel`;
- Host notice `taskFlow.updated`.

Internal controller methods do not imply an autonomous executor. No accepted code converts Goal Plan Steps into Tasks automatically.

## Focused evidence

- `tests/unit/task-flow-registry-step020b.test.mjs`
- `tests/unit/task-flow-protocol-step020b.test.mjs`
- `tests/unit/task-flow-host-step020b.test.mjs`
- `tests/unit/validation-governance-step020b.test.mjs`

They prove schema, revision conflicts, wait/block/resume, one-Task-one-Flow, multi-child cancellation, closed protocol and real Host restart identity.

## Failure continuity

### OR-ISSUE-237

Initial migration 019 added a foreign key from `task_flows.workspace_id` to `workspace_registrations`. Focused execution proved that this imposed a stronger registration precondition than accepted Conversation/Task runtime ownership. The FK was removed; configured workspace authorization and same-workspace link checks remain in `TaskFlowService`.

Evidence: `reference/validation/STEP020B_OR_ISSUE_237.md`.

### OR-ISSUE-238

The first full canonical run proved that the STEP020B current-continuation rewrite omitted the retained
`OR-ISSUE-213` token from `HANDOFF.md` and `VALIDATION.md`. Product behavior was unaffected, but
the ZIP-only handoff no longer exposed the pre-observed child-close lifecycle failure. The token was
restored in both mutable continuation assets and a STEP020B governance assertion now prevents another
omission.

Evidence: `reference/validation/STEP020B_OR_ISSUE_238.md`.

### OR-ISSUE-239

The second full canonical run found the adjacent STEP016CH2 continuity token `OR-ISSUE-214` missing
from the same mutable handoff assets. This issue protects the distinction between secret redaction,
transient prompt echo and authorized conversation-history visibility. The Product privacy checks remained
green; only the ZIP continuation visibility was incomplete.

Evidence: `reference/validation/STEP020B_OR_ISSUE_239.md`.

## Document-inclusive local source/package acceptance

```text
checks=36/36
state=PASSED
focused_product=6/6
affected_regression=73/73
governance=127/127
canonical_files=130
canonical_tests=706/706
manifest=1455/1455
automated_run_seconds=145.336
```

Evidence: `reference/validation/STEP020B_LOCAL_SOURCE_PACKAGE_ACCEPTANCE.md`.

## Commands

```cmd
pnpm install --frozen-lockfile
pnpm acceptance:step020b
pnpm acceptance:step020b:live
```

The Windows live harness must run on actual Windows. Linux source/package acceptance cannot promote the Product baseline.

## Explicit deferrals

```text
executor=DEFERRED_NO_AUTONOMOUS_PLAN_TO_TASK
model_controller=NOT_RUN
notification=DEFERRED
flow_audit_repair=DEFERRED
lost_sweeper=DEFERRED
retention=DEFERRED
distributed_workers=DEFERRED
external_model=NOT_RUN
browser_live=NOT_RUN
connector=DEFERRED_NO_REAL_SYSTEM
```

## Next boundary after acceptance

Only after STEP020B Windows acceptance, audit OpenClaw `task-executor.ts` and concrete OpenRill usage scenarios to decide whether the next step should add controller-driven admission/execution, maintenance/reconciliation, or notification. Do not combine these without code evidence.

## Retained historical continuity

The following unresolved or deferred assets remain retained while STEP020B proceeds:

- `OR-ISSUE-190`: retained Control UI/browser evidence backlog.
- `OR-ISSUE-191`: retained external Harness/browser-live evidence backlog.
- `OR-ISSUE-206` and `OR-ISSUE-207`: retained first-run and external dependency continuity assets.
- `OR-ISSUE-212`: every current root handoff document carries the exact current candidate and dynamically accepted baseline tuple.
- `OR-ISSUE-213`: pre-observed child-process close remains a retained live-Harness lifecycle failure and race-safe close gate.
- `OR-ISSUE-214`: authorized history visibility remains distinct from secret redaction and transient prompt echo.
- `OR-ISSUE-239`: current continuation rewrites are preflighted against every canonical handoff/validation reader.
- `OR-ISSUE-238`: current continuation rewrites must retain every issue token required by canonical recurrence tests.

Mattermost and Connector work remains speculative and deferred until a concrete real adapter contract and executable real API/event environment exist. No fake surface is promoted as real integration evidence. Plugin runtime are deferred; no Plugin marketplace or remote plugin installation is claimed.

## STEP022CR3 Windows CMD entrypoint byte-contract corrective

- Packaging corrective: `STEP022CR3_WINDOWS_CMD_ENTRYPOINT_BYTE_CONTRACT_CLOSURE`.
- Product identity remains `STEP022C_MATTERMOST_REAL_CONNECTOR_DURABLE_VERTICAL_SLICE`, version `0.24.0-step022c`, schema 25.
- The user-facing CMD entrypoint is `start-and-run-step022c-live.cmd` in this repository root; no second directory and no external root argument are allowed.
- The primary CMD file is non-empty ASCII with Windows CRLF and directly runs `call pnpm install --frozen-lockfile` followed by `call pnpm mattermost:testbed:live`; it does not delegate to PowerShell.
- Packaging must reopen the ZIP and byte-verify all root CMD entrypoints before success (`OR-ISSUE-372`).
- Real Windows Mattermost live remains pending; the official Product baseline remains STEP021BR2 until that gate passes.

