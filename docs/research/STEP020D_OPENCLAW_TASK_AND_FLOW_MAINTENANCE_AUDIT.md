# STEP020D OpenClaw Task and Task Flow Maintenance Audit

## Audited reference

OpenClaw `2026.7.2` from the user-supplied `openclaw-main.zip` is the answer key for maintenance behavior. The following actual source files were inspected:

- `src/tasks/task-registry.audit.ts`
- `src/tasks/task-registry.maintenance.ts`
- `src/tasks/task-flow-registry.audit.ts`
- `src/tasks/task-flow-registry.maintenance.ts`
- the Task retention helpers and cancellation-state predicates reached from those files

This document records source findings, not an assumption based on names or documentation.

## OpenClaw contracts observed

### Task audit and maintenance

OpenClaw separates read-only audit from maintenance. Audit identifies stale queued/running records, retained or expired lost Tasks, missing cleanup timestamps, delivery failures, and timestamp inconsistencies. Maintenance consults actual execution/session authorities before marking a Task lost, retries recoverable work, schedules cleanup, and prunes only terminal records that are outside active runtime boundaries.

### Task Flow audit and maintenance

OpenClaw audits stale running/waiting/blocked Flows, stuck cancellation, missing linked Tasks, missing blocked Tasks, restore failures, and inconsistent timestamps. Maintenance may safely finalize a cancel-requested managed Flow after active child Tasks disappear. Pruning is protected by terminal status and the absence of active linked Tasks.

### Important ownership distinction

OpenClaw's maintenance code does not infer normal Flow success or failure merely because child Tasks are terminal. Managed controller state remains authoritative for ordinary Flow outcomes. Cancellation finalization is a narrower safe repair.

## OpenRill code-grounded differences

### Run row deletion cannot leave a Task orphan

OpenRill migration 018 defines `background_tasks.run_id` as a foreign key to `agent_runs(run_id) ON DELETE CASCADE`. Therefore a durable Task whose Run row was physically deleted cannot remain as an auditable orphan under the accepted schema. A generic `MISSING_RUN -> LOST` rule would be imaginary for this database model.

OpenRill LOST therefore means:

```text
active Run and Task projection
+ Host recovery grace elapsed
+ runtime authority is available
+ Run is neither active nor intentionally idle
+ recovery did not reclaim execution ownership
=> fail owning Run NON_RESUMABLE and project Task LOST
```

Run/runtime remains the execution Source of Truth. Task remains the durable activity projection.

### Conservative repair boundary

STEP020D divides maintenance into three operations:

```text
Audit      = diagnostics only
Reconcile  = safe, idempotent repairs only
Retention  = preview/schedule only; no row deletion
```

Safe repair includes Run-terminal to Task-terminal projection, runtime-authority-loss closure, cancellation replay/finalization, and cleanup timestamp scheduling. Owner/provenance mismatch, terminal projection over active authority, terminal Flow with active children, and malformed lifecycle timestamps remain report-only.

### Controller-owned Flow completion

OpenRill does not auto-succeed or auto-fail a normal Flow from child outcomes. `FLOW_ALL_CHILDREN_TERMINAL_ACTIVE` is diagnostic only. The bound controller introduced in STEP020C remains responsible for normal success/failure.

### Retention is deliberately weaker than OpenClaw pruning

OpenClaw can delete old terminal registry records. OpenRill has append-only Task/Flow event evidence and cascading relational ownership whose deletion policy has not yet been separately accepted. STEP020D only adds `cleanup_after`, schedules it, and previews expired candidates. Active, waiting, blocked, cancellation-requested, inconsistent, or authority-conflicted records are protected.

## Adopted STEP020D boundary

- schema 21 `cleanup_after` projections for Tasks and Task Flows;
- Task and Flow audit services;
- PREVIEW/APPLY reconciliation;
- Host-start safe reconciliation without retention mutation;
- actual runtime-authority-loss LOST closure after recovery grace;
- cancellation-stuck replay and finalization;
- explicit retention scheduling and preview;
- closed Local Protocol operations for all six maintenance surfaces;
- no prune, no periodic scheduler, no distributed lease, no autonomous Plan executor.

## Explicitly deferred

- physical pruning and event-evidence archival;
- periodic sweeper cadence and leader election;
- multi-Host ownership leases;
- requester notification/delivery;
- autonomous Goal Plan-to-Task execution;
- external model, Browser LIVE, and real Connector acceptance.
