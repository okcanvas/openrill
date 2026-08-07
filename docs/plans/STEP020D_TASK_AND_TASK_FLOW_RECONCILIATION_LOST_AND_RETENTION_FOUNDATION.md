# STEP020D Task and Task Flow Reconciliation, LOST, and Retention Foundation

## Identity

```text
step=STEP020D_TASK_AND_TASK_FLOW_RECONCILIATION_LOST_AND_RETENTION_FOUNDATION
version=0.20.4-step020d
state_schema=21
accepted_product_baseline=STEP020C_BOUND_TASK_FLOW_CONTROLLER_RUNTIME_AND_ATOMIC_CHILD_TASK_ADMISSION
```

## Goal

Add the maintenance boundary required after STEP020C without creating a second executor or allowing a maintenance pass to invent controller decisions.

## Constitutional ownership

```text
Run/runtime = execution lifecycle Source of Truth
Task        = durable Run-linked activity projection
Task Flow   = controller-owned orchestration state
Maintenance = diagnostics plus narrowly safe repair
```

## Scope

### State

Migration 021 adds nullable indexed `cleanup_after` to `background_tasks` and `task_flows`. Existing rows migrate non-destructively. No row is pruned in this STEP.

### Task audit

Detect status drift, terminal-Task/active-Run conflicts, missing runtime authority after grace, stale queued/running state, owner mismatch, inconsistent timestamps, missing cleanup scheduling, and retained/expired LOST state.

### Task reconcile

- project authoritative terminal Run status into Task;
- after Host recovery grace, close an unreclaimed active Run as FAILED/NON_RESUMABLE and project Task LOST;
- preserve approval/delegation-wait and other expected-idle Runs;
- schedule retention only when both Task and owning Run are terminal;
- make repeated APPLY idempotent.

### Task Flow audit and reconcile

- diagnose stale running/waiting/blocked state;
- replay stuck cancellation through child Tasks and owning Runs;
- finalize cancel-requested Flow only after children are terminal;
- never infer ordinary Flow success/failure from child outcomes;
- report terminal Flow with active child, owner mismatch, missing child, or malformed timestamps without auto-repair;
- schedule retention only for terminal Flow with no active or missing child.

### Host lifecycle

After normal Run recovery/scheduling has had its opportunity, Host startup performs safe APPLY reconciliation with retention disabled. Startup may repair Task projections and cancellation completion. It does not schedule cleanup or delete evidence.

### Local Protocol

```text
task.audit
task.reconcile
task.retention.preview
taskFlow.audit
taskFlow.reconcile
taskFlow.retention.preview
```

All inputs are closed and bounded. Reconcile mode is exactly `PREVIEW | APPLY`.

## Failure-closed rules

- No runtime authority callback means no automatic LOST transition.
- Recovery grace must elapse before LOST eligibility.
- Expected-idle Run is never marked LOST.
- Terminal Task over active Run is report-only and retention-protected.
- Terminal Flow with active/missing child is report-only and retention-protected.
- Maintenance never auto-completes ordinary controller-owned Flow.
- Physical deletion is absent.

## Acceptance

Focused Product acceptance must prove:

1. authoritative Run projection repair and idempotent cleanup scheduling;
2. runtime-authority-loss LOST only after grace;
3. expected-idle and inconsistent active authority protection;
4. cancellation-stuck replay and finalization;
5. normal all-terminal Flow remains controller-owned;
6. terminal Flow with active child remains report-only and protected;
7. six closed protocol operations;
8. actual Host-start reconciliation with retention left explicit.

Windows LIVE additionally runs the focused suite on Windows and checks schema/version and exact maintenance markers. External model, Browser LIVE, real Connector, physical prune, and autonomous Plan execution remain outside this acceptance.
