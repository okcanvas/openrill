# STEP020A — Durable Background Task Ledger and Runtime Lifecycle Foundation

## Identity

```text
step=STEP020A_DURABLE_BACKGROUND_TASK_LEDGER_AND_RUNTIME_LIFECYCLE_FOUNDATION
version=0.20.0-step020a
state_schema=18
accepted_product_baseline=STEP019B_DETACHED_RUN_AND_HOST_RESTART_AUTO_RESUME_FOUNDATION
```

## Problem proven from code

The accepted STEP019B baseline owns durable Runs and restart-safe execution, but operators and higher-level components have no uniform durable Task ledger spanning Conversation, Delegation and Automation. Plan Steps represent intended work, not detached runtime activity. Reusing them as Task records would mix intent, execution and orchestration.

OpenClaw source confirms that Task is a separate activity ledger driven by owning runtimes and that Task Flow is another independent controller layer. See `docs/research/STEP020A_OPENCLAW_BACKGROUND_TASK_REFERENCE_AUDIT.md`.

## Design rules

1. Run remains authoritative for execution state.
2. Every Run receives exactly one Task in the same State transaction.
3. Task mirrors lifecycle but never schedules work.
4. Runtime owners classify and cancel their Tasks through existing Run boundaries.
5. Terminal Task state is monotone.
6. A previously started `CREATED/RESUMABLE` Run remains Task `RUNNING`; restart waiting is not new queue admission.
7. Goal, Plan, Task and future Task Flow remain separate.

## State schema 18

Migration `018_durable_background_task_ledger.sql` adds:

- `background_tasks`: one row per Run with workspace/conversation/run provenance, runtime, task kind, source, parent linkage, status, recovery, progress, terminal/error, timing and revision.
- `background_task_events`: append-only Task lifecycle/classification evidence.

The unique `run_id` constraint enforces one Task per Run.

## Product boundaries

- `StateTaskRepository`: persistence, classification, lifecycle projection and events.
- `ConversationRepository`: creates and synchronizes Task inside Run transactions.
- `@openrill/tasks`: authorization, list/get/getByRun/classify and cancel delegation.
- Delegation: classifies child Run Task and binds parent Task.
- Automation executor: reclassifies the existing Run Task as Automation; no second row.
- Host protocol: `task.list`, `task.get`, `task.cancel`.

## Validation

Focused Product evidence proves:

- schema/tables and one-to-one Run/Task identity;
- lifecycle projection and terminal monotonicity;
- resumable Host interruption remains Task `RUNNING/RESUMABLE`;
- delegation parent-child Task linkage;
- Automation reclassification without duplication;
- closed protocol validation;
- real Host restart preserves Task identity through success;
- Task cancellation terminally cancels the owning Run and is replay-safe.

Affected regression retains STEP019B restart/exactly-once, Delegation, Automation, Conversation events and State behavior.

## Failure assets

- OR-ISSUE-233: offline package-manager bootstrap failure.
- OR-ISSUE-234: current-root package export build bootstrap.
- OR-ISSUE-235: mandatory TaskService injection broke retained Automation callers.

## Windows promotion

```cmd
pnpm install --frozen-lockfile
pnpm acceptance:step020a:live
```

Harness: `STEP020A_H1_DURABLE_TASK_PROTOCOL_RESTART_AND_CANCELLATION`.

Promotion requires actual Windows SQLite, protocol, Host restart, Task identity continuity and owning-Run cancellation. External model, Browser live and Connector are not required.

## Explicit exclusions

STEP020A does not implement Task Flow, delivery/notification, stale-runtime reconciliation, `lost` sweeping, retention/pruning, distributed workers, remote leases, external-model acceptance, Browser live, Mattermost or Connector integration.
