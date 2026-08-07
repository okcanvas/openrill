# STEP020E Durable Task Completion Delivery, Controller Wake, and Required-Completion Semantics

```text
step=STEP020E_DURABLE_TASK_COMPLETION_DELIVERY_CONTROLLER_WAKE_AND_REQUIRED_COMPLETION_SEMANTICS
version=0.20.5-step020e
state_schema=22
baseline=STEP020D_TASK_AND_TASK_FLOW_RECONCILIATION_LOST_AND_RETENTION_FOUNDATION
```

## Goal

Close the missing continuation between a terminal managed child Task and its Conversation-bound Task Flow controller without adding an autonomous Plan executor or second scheduler.

## Product invariants

1. Run/runtime remains execution Source of Truth.
2. Task terminal projection and delivery intent commit atomically.
3. One terminal Task event owns at most one delivery intent.
4. Owner Conversation system message, wake Run, silent wake Task, and delivery binding commit atomically.
5. Existing Run coordinator remains the only Run executor.
6. Host restart drains `PENDING`, `SESSION_QUEUED`, and retryable `FAILED` delivery rows.
7. Exact replay reuses the same queued wake Run; a failed controller decision retry creates a new wake Run.
8. A delivery becomes `DELIVERED` only after a successful controller decision Tool event.
9. Normal child and delegation Runs never see controller tools.
10. Restarted wake Runs retain the same exact Tool scope through durable budget provenance.
11. Empty/progress-only child output is `terminalOutcome=BLOCKED`, not a valid final deliverable.
12. Flow success/failure remains controller-owned.

## Schema 22

- Task: `notify_policy`, `delivery_status`, `terminal_outcome`.
- New `task_completion_deliveries` durable ledger with unique Task-event identity, status, attempt, system message, wake Run and revision.
- Safe schema-21 terminal-child backfill for active non-cancelling owner-matched Flows.

## Controller wake tools

```text
task_flow.get
task_flow.run
task_flow.wait
task_flow.block
task_flow.finish
task_flow.fail
task_flow.cancel
```

The wake controller must make one explicit durable decision. Explanatory text alone fails the delivery with `CONTROLLER_DECISION_REQUIRED` and permits a new replay-safe attempt.

## Validation

Focused tests cover semantic completion, atomic rollback, durable queue/reopen/drain, decision-required retry, cancellation suppression, migration backfill, Host finish, Host BLOCKED continuation, and Host restart with durable Tool-scope confinement.

## Deferred

Autonomous Goal Plan execution, real Connector/channel delivery, physical prune, periodic/distributed sweeping, Browser UI, external model and Browser LIVE remain deferred.
