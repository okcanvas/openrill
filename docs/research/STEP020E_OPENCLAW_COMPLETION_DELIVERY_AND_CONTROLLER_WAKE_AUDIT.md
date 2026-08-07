# STEP020E OpenClaw Completion Delivery and Controller Wake Audit

## Audited reference

```text
OpenClaw version=2026.7.2
sha256=1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82
OpenRill baseline=STEP020D / 0.20.4-step020d / schema 21 / Windows 53/53
```

The audit followed production callers rather than type names. The primary OpenClaw sources were:

- `src/tasks/task-registry-lifecycle.ts`
- `src/tasks/task-registry-delivery.ts`
- `src/tasks/task-completion-contract.ts`
- `src/tasks/task-flow-registry.ts`
- `src/plugins/runtime/runtime-taskflow.ts`
- Gateway heartbeat/session-event callers reached from delivery.

## Code-confirmed gap

OpenClaw records terminal/state-change delivery state, resolves the Flow owner session, enqueues a bounded system event, and requests an immediate heartbeat. OpenRill STEP020D projected Run terminal state into Task state but had no durable delivery intent, owner Conversation system event, or bound controller wake. `FLOW_ALL_CHILDREN_TERMINAL_ACTIVE` was correctly report-only, but no production caller reactivated the controller to make the next decision.

OpenClaw also distinguishes execution success from required semantic completion. Empty or progress-only output is not a valid required deliverable even when the underlying run exits successfully.

## Adopted OpenRill boundary

STEP020E adopts the contract, not OpenClaw storage layout:

```text
child Task terminal mutation
→ same transaction creates one durable delivery intent
→ owner Conversation system message + wake Run + silent wake Task commit atomically
→ existing Run coordinator schedules the wake Run
→ exactly seven bound task_flow tools are exposed
→ controller must run/wait/block/finish/fail/cancel
→ delivery becomes DELIVERED only after a successful controller decision Tool event
```

OpenRill retains stronger existing properties: Conversation owner scope, controller identity, revision-CAS, append-only Task/Flow events, and atomic State transactions.

## Required-completion semantics

`Run COMPLETED` remains an execution fact. Managed child Task projection adds `terminalOutcome`:

- concrete non-progress output → `SUCCEEDED`;
- empty or progress-only output → `BLOCKED`;
- underlying failure/cancellation/LOST preserves terminal Task status and requires controller review.

The Flow is never automatically marked successful merely because all child Tasks are terminal.

## Upgrade boundary

Schema 21 can contain terminal managed child Tasks that predate delivery semantics. Migration 22 backfills only active, non-cancelling, owner-matched Flows. Historical `SUCCEEDED` children become `terminalOutcome=BLOCKED` with a controller-review delivery because their old output was not validated by the new contract. Terminal/cancelling/owner-mismatched Flows are not awakened.

## Explicit deferrals

Real Connector delivery, requester channel origin, operator UI, periodic delivery sweeper, physical prune, autonomous Goal Plan-to-Task execution, external model, and Browser LIVE are not claimed by STEP020E.
