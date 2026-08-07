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

<!-- STEP021A_CURRENT_START -->
# Current Candidate — STEP021A Durable Goal Plan Executor

```text
STEP=STEP021A_DURABLE_GOAL_PLAN_TO_TASK_FLOW_EXECUTOR_FOUNDATION
VERSION=0.21.0-step021a
STATE_SCHEMA=23
SOURCE_PACKAGE=ACCEPTED
PROMOTION=WINDOWS_GOAL_PLAN_EXECUTOR_LIVE_PENDING
ACCEPTED_BASELINE=STEP020ER3_WINDOWS_PYTHON_LIVE_MARKER_VALIDATOR_ENTRYPOINT_CLOSURE
ACCEPTED_VERSION=0.20.8-step020er3
ACCEPTED_SCHEMA=22
ACCEPTED_CHECKS=66/66
ACCEPTED_ZIP=openrill-step020er3-windows-python-live-marker-validator-entrypoint-closure-v1.zip
ACCEPTED_SHA256=7586fad590f11e6f7595582ed58eab2383e8f15f2884fb5d9b8113abaef64dd4
ACCEPTED_EVIDENCE=reference/validation/STEP020ER3_WINDOWS_PYTHON_VALIDATOR_LIVE_ACCEPTANCE.md
LOCAL_ACCEPTANCE=57/57 PASSED
FOCUSED_PRODUCT=12/12
AFFECTED_REGRESSION=116/116
GOVERNANCE=183/183
CANONICAL=155 files / 814/814 tests
ARCHITECTURE=37 packages / 98 edges / 168 sources
EXPORTS=37/37
LOCAL_ACCEPTANCE_EVIDENCE=reference/validation/STEP021A_LOCAL_SOURCE_PACKAGE_ACCEPTANCE.md
```

STEP021A connects the durable Goal and revisioned ordered Plan to the existing Conversation-bound Task Flow runtime. It preserves the constitutional separation `Goal/Plan intent != Step execution projection != Task execution fact != Run authority`. One active Step and one active child Task are allowed. Step admission is atomic across Message, Run, Attempt, Submission, Task, Flow link and Goal execution projection. Semantic completion returns through the durable owner-controller wake path. Generic Task Flow and Goal/Plan mutation paths cannot bypass executor ownership. Host recovery preserves identity, waits for explicit controller continuation, and idempotently closes a cancellation projection that was interrupted after Flow cancellation.

OpenClaw `2026.7.2` is the answer-key source for bound controller, child admission and completion-delivery behavior; it does not contain the same OpenRill Goal/revisioned ordered Plan executor, so STEP021A is explicitly an OpenRill-native integration rather than a source-equivalence claim.

Detailed plan: `docs/plans/STEP021A_DURABLE_GOAL_PLAN_TO_TASK_FLOW_EXECUTOR_FOUNDATION.md`. Source audit: `reference/validation/STEP021A_OPENCLAW_SOURCE_AUDIT.md`. Failure assets: `OR-ISSUE-274` through `OR-ISSUE-290`.
<!-- STEP021A_CURRENT_END -->

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
# NOTICE

이 저장소의 설계 작업은 사용자가 제공한 OpenClaw `2026.7.2` 소스를 참조했다.

- Source archive SHA-256: `1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82`
- Declared source license: MIT
- Source identity evidence: `reference/openclaw/SOURCE_MANIFEST.json`

OpenClaw 소스 코드는 이 저장소에 포함하지 않는다. `/reference/openclaw`에는 경로·symbol·짧은 관찰 사실과 독립 재설계 판단만 포함한다.

## STEP022CR3 Windows CMD entrypoint byte-contract corrective

- Packaging corrective: `STEP022CR3_WINDOWS_CMD_ENTRYPOINT_BYTE_CONTRACT_CLOSURE`.
- Product identity remains `STEP022C_MATTERMOST_REAL_CONNECTOR_DURABLE_VERTICAL_SLICE`, version `0.24.0-step022c`, schema 25.
- The user-facing CMD entrypoint is `start-and-run-step022c-live.cmd` in this repository root; no second directory and no external root argument are allowed.
- The primary CMD file is non-empty ASCII with Windows CRLF and directly runs `call pnpm install --frozen-lockfile` followed by `call pnpm mattermost:testbed:live`; it does not delegate to PowerShell.
- Packaging must reopen the ZIP and byte-verify all root CMD entrypoints before success (`OR-ISSUE-372`).
- Real Windows Mattermost live remains pending; the official Product baseline remains STEP021BR2 until that gate passes.

