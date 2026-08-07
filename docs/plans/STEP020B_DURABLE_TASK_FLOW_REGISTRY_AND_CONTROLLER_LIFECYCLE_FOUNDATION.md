# STEP020B — Durable Task Flow Registry and Controller Lifecycle Foundation

## Identity

```text
step=STEP020B_DURABLE_TASK_FLOW_REGISTRY_AND_CONTROLLER_LIFECYCLE_FOUNDATION
version=0.20.1-step020b
state_schema=19
accepted_product_baseline=STEP020A_DURABLE_BACKGROUND_TASK_LEDGER_AND_RUNTIME_LIFECYCLE_FOUNDATION
```

## Problem proven from code

STEP020A records each detached Run as one durable Task, but no durable controller object can group Tasks, persist current orchestration state, wait or block, detect stale writes, or cascade cancellation. OpenClaw source confirms that this is a separate Task Flow concern rather than another meaning of Goal/Plan or Task.

## Design rules

1. Goal/Plan remains intent and ordered proposal.
2. Task remains one Run-linked execution fact and never becomes a scheduler.
3. Task Flow is controller-owned orchestration state over linked Tasks.
4. The owning Run/runtime remains authoritative for Task execution and cancellation.
5. All non-replay Flow mutations require an expected revision.
6. A Task may belong to at most one Flow; a Flow may link many Tasks.
7. Terminal Flow state is monotone.
8. Cancellation records intent before cascading to active child Tasks.
9. Host restart restores identity and state. STEP020B does not autonomously convert Plan Steps into Tasks and does not invent an autonomous next-step executor.

## State schema 19

Migration `019_durable_task_flow_registry.sql` adds:

- `task_flows`: controller, goal, lifecycle, revision, step, state, wait, blocked evidence, cancel request and timing.
- `task_flow_tasks`: Flow-to-Task links with unique `task_id`.
- `task_flow_events`: append-only lifecycle and linkage evidence.

Workspace authorization stays at the service boundary. The migration intentionally does not require a `workspace_registrations` row because accepted Conversation/Task ownership already permits configured workspace IDs without creating that unrelated persistence record.

## Product boundaries

- `StateTaskFlowRepository`: durable rows, revision-CAS, links and events.
- `@openrill/task-flows`: authorization, lifecycle, linking, cancellation cascade and views.
- Local Protocol: `taskFlow.list`, `taskFlow.get`, `taskFlow.cancel`.
- Host: owns the service instance and delegates each child cancellation through existing Task/Run boundaries.

Create, link, start, wait, block, resume and terminal controller methods are internal Product APIs in this foundation. Public protocol mutation is deliberately limited to operator cancellation.

## Validation

Focused tests prove:

- schema 19 and all three tables;
- revision conflict rejection;
- waiting, blocked, resume and terminal lifecycle;
- one Task cannot join two Flows;
- Flow cancellation requests first, cascades to all active child Tasks and replays safely;
- closed protocol validation and error mapping;
- actual Host close/restart preserves Flow identity and then cancels it without client-side recreation.

Affected regression retains STEP020A Task lifecycle, STEP019B restart/exactly-once, Goal/Plan, Delegation, Automation, Conversation and State behavior.

## Failure asset

- OR-ISSUE-237: a Task Flow workspace foreign key incorrectly imposed a stronger persistence precondition than the accepted runtime ownership boundary.

## Windows promotion

```cmd
pnpm install --frozen-lockfile
pnpm acceptance:step020b:live
```

Harness: `STEP020B_H1_TASK_FLOW_PROTOCOL_RESTART_REVISION_AND_CANCELLATION`.

Promotion requires actual Windows SQLite, revision-CAS lifecycle tests, Local Protocol, Host restart Flow identity and child cancellation cascade. External model, Browser live and real Connector are not required.

## Explicit exclusions

STEP020B does not implement autonomous Plan execution, automatic next-step scheduling, model-driven orchestration, delivery/notification, audit repair, LOST sweeping, retention/pruning, distributed workers, remote leases, external-model acceptance, Browser live or real Connector integration.
