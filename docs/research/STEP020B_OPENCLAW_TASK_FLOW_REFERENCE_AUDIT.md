# STEP020B OpenClaw Task Flow Reference Audit

## Audit rule

OpenClaw is the reference implementation for persistent Agent, Task and Task Flow behavior. The audit uses actual source and tests; OpenRill extracts the lifecycle contracts required by its accepted architecture instead of copying package surfaces blindly.

Audited archive:

```text
openclaw-main.zip
sha256=1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82
version=2026.7.2
```

## Source inspected

- `src/tasks/task-flow-registry.types.ts`
- `src/tasks/task-flow-registry.ts`
- `src/tasks/task-flow-registry.store.sqlite.ts`
- `src/tasks/task-flow-registry.audit.ts`
- `src/tasks/task-flow-registry.maintenance.ts`
- `src/tasks/task-flow-owner-access.ts`
- `src/tasks/task-executor.ts`
- `src/tasks/task-registry.types.ts`
- `src/tasks/task-registry-query.ts`
- `src/plugins/runtime/runtime-taskflow.ts`
- associated Task Flow, Task registry, owner-access, audit and store tests

## Code-confirmed reference contracts

### Task Flow is controller-owned orchestration state

A managed OpenClaw flow has its own durable identity, owner key, controller ID, revision, lifecycle status, goal, current step, blocked Task reference, state JSON, wait JSON, cancellation request time and terminal time. It is not a synonym for Goal/Plan or Task.

### Revision is the write-conflict boundary

Managed updates require an expected revision. A stale revision returns a conflict instead of silently overwriting a newer controller decision. Waiting, blocked, resume and cancellation all pass through this boundary.

### One Flow can own several Tasks; a Task belongs to at most one Flow

OpenClaw stores the link on `TaskRecord.parentFlowId`, queries all Tasks for a Flow, and uses that set for summary, cancellation and maintenance. OpenRill represents the same relationship as `task_flow_tasks` with a unique `task_id`.

### Cancellation is requested before children are drained

OpenClaw records `cancelRequestedAt`, cancels linked active Tasks, then finalizes when linked work is terminal. Cancellation is not a direct unrecorded deletion.

### Persistence, ownership and maintenance are separate responsibilities

SQLite persistence restores Flow identity and revision after process restart. Owner-scoped access prevents cross-owner reads. Audit, stale cancellation reconciliation, lost classification, retention and pruning are separate modules and are not required to establish the first Flow registry contract.

## Accepted OpenRill baseline

STEP020A already owns:

- one durable Task per Run;
- stable Task identity across Host restart;
- Conversation, Delegation and Automation classification;
- Run-owned terminal cancellation;
- closed `task.list`, `task.get`, `task.cancel` operations.

It does not own a durable controller record that links several Tasks, persists wait/block state, rejects stale controller writes or cascades a Flow cancellation.

## STEP020B decision

Add a durable Task Flow registry with this separation:

```text
Goal/Plan = durable intent and ordered proposal
Task = one Run-linked execution fact
Task Flow = controller-owned orchestration state over multiple Tasks
Run/runtime = actual executor and cancellation authority
```

The Flow registry does not autonomously convert Plan Steps into Tasks and does not become a second general scheduler.

## Implemented foundation

- State schema 19 with `task_flows`, `task_flow_tasks`, `task_flow_events`.
- Controller-owned Flow identity, status, revision, current step, state, wait and blocked evidence.
- Optimistic revision-CAS for every non-replay mutation.
- One Flow to many Tasks; one Task to at most one Flow.
- Terminal monotonicity.
- Cancellation request, child Task cascade and replay-safe terminal finalization.
- Closed protocol operations: `taskFlow.list`, `taskFlow.get`, `taskFlow.cancel`.
- Host restart preservation of the same Flow ID, revision, links and wait/block state.

## Explicitly deferred reference capabilities

- autonomous Plan-to-Task execution and next-step admission;
- model-selected controller decisions;
- delivery/notification routing;
- audit repair, stuck-cancel reconciliation and LOST sweeping;
- retention/pruning;
- distributed Flow ownership, leases or remote workers;
- real Connector, external-model and Browser-live acceptance.
