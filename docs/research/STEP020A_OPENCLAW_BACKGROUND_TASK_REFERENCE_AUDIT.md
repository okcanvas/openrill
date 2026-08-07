# STEP020A OpenClaw Background Task Reference Audit

## Audit rule

OpenClaw is the reference implementation for durable Agent/Task behavior. OpenRill does not copy its package surface or compatibility contracts blindly; it extracts only code-confirmed lifecycle ownership that is missing from the accepted OpenRill baseline.

Audited archive:

```text
openclaw-main.zip
sha256=1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82
version=2026.7.2
```

## OpenClaw source inspected

- `src/tasks/task-registry.types.ts`
- `src/tasks/detached-task-runtime-contract.ts`
- `src/tasks/detached-task-runtime.ts`
- `src/tasks/task-flow-registry.types.ts`
- `src/tasks/task-flow-registry.ts`
- `src/tasks/task-flow-registry.maintenance.ts`
- `docs/automation/tasks.md`

## Code-confirmed reference model

### Task is an activity ledger, not a scheduler

OpenClaw documents and implements Task records as durable facts about detached work. Scheduling remains owned by Automation, heartbeat, subagent or another runtime. A Task carries runtime, task kind, source, owner/session/run linkage, parent linkage, status, progress, terminal/error and timing data.

### Task lifecycle is independent but driven by its owning runtime

The detached runtime contract has explicit create/start/progress/finalize/cancel/recover operations. Status moves through queued/running to terminal `succeeded`, `failed`, `timed_out`, `cancelled` or `lost`. Terminal state is monotone.

### Goal/Plan, Task and Task Flow are separate concepts

- Goal/Plan: durable intent and ordered work definition.
- Task: one detached activity/run lifecycle record.
- Task Flow: a separate multi-step orchestration record with its own status, current step, blocked task and wait state.

Therefore an OpenRill Goal Plan Step must not be reinterpreted as the Task ledger row. That would merge intent, execution fact and orchestration ownership.

### Recovery, delivery and maintenance are additional layers

OpenClaw separately implements runtime-aware recovery before `lost`, completion delivery/notification, retention/pruning and Task Flow maintenance. These are real reference capabilities, but they are not prerequisites for the first durable Task ledger boundary.

## OpenRill accepted baseline audit

STEP019B already provides:

- durable Conversation Run and Attempt provenance;
- acknowledgement-first detached submission;
- Host restart auto-resume for checkpoint-safe root Runs;
- exactly-once reuse of completed Tool results;
- Goal/Plan durable intent state;
- Delegation and Automation execution owners.

STEP019B does not provide an independent durable activity ledger that can list, inspect and cancel detached work across Conversation, Delegation and Automation runtimes. Run records are execution SOT, but there is no uniform Task projection or Task event history.

## STEP020A decision

Add one durable Task per Run and preserve strict ownership:

```text
Run = authoritative execution lifecycle
Task = durable cross-runtime activity ledger and operator surface
Goal/Plan = intent and ordered plan
Task Flow = deferred higher-level orchestration
Automation/Delegation/Conversation = schedulers or runtime owners
```

Task cancellation delegates to the owning Run/runtime. Task does not execute, lease or schedule work.

## Implemented scope

- State schema 18: `background_tasks`, `background_task_events`.
- Exactly one Task per durable Run.
- Runtime classification: `CONVERSATION`, `DELEGATION`, `AUTOMATION`.
- Status: `QUEUED`, `RUNNING`, `SUCCEEDED`, `FAILED`, `TIMED_OUT`, `CANCELLED`, `LOST`.
- Recovery projection: `NONE`, `RESUMABLE`, `NON_RESUMABLE`.
- Transactional Run/Task creation and lifecycle synchronization.
- Parent Task linkage for delegated Runs.
- Existing Task reclassification for Automation Runs; no duplicate Task.
- Closed local protocol operations: `task.list`, `task.get`, `task.cancel`.
- Terminal monotonicity and replay-safe cancellation.

## Explicitly deferred reference capabilities

- managed Task Flow orchestration;
- delivery/notification policy and channel routing;
- runtime-aware stale ownership audit and `lost` sweeper;
- retention, cleanup timestamps and pruning;
- distributed leases, remote workers and multi-Host ownership;
- arbitrary in-flight external Tool transaction continuation.

These remain candidate follow-up work only after STEP020A Windows evidence and concrete scenarios establish need.
