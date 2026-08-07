# STEP020C Local Source/Package Acceptance

## Scope

This evidence records code-level source/package acceptance for `STEP020C_BOUND_TASK_FLOW_CONTROLLER_RUNTIME_AND_ATOMIC_CHILD_TASK_ADMISSION`. It does not claim Windows LIVE acceptance or Product-baseline promotion.

## Recorded acceptance marker

```text
STEP020C_BOUND_TASK_FLOW_CONTROLLER_RUNTIME_AND_ATOMIC_CHILD_TASK_ADMISSION checks=42/42 state=PASSED version=0.20.3-step020c schema=20 accepted_product_baseline=STEP020BR1_TASK_FLOW_OWNER_SCOPE_AND_CANCEL_ADMISSION_CLOSURE accepted_checks=35/35 controller=CONVERSATION_BOUND flow=DETERMINISTIC_MANAGED admission=ATOMIC_RUN_TASK_FLOW execution=EXISTING_RUN_COORDINATOR replay=IDENTITY_STABLE_TERMINAL_NOT_RESCHEDULED restart=RUNTIME_REBOUND cancellation=CHILD_CASCADE plan_executor=DEFERRED openclaw_reference=BOUND_RUNTIME_AND_TASK_EXECUTOR_SOURCE_AUDITED external_model=NOT_RUN browser_live=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM focused_product=18 affected_regression=73 governance=139 canonical_files=136 canonical_tests=730 windows_bound_controller_live=PENDING_ENV live_harness=STEP020C_H1_BOUND_CONTROLLER_ATOMIC_CHILD_ADMISSION_RESTART_AND_CANCELLATION promotion=WINDOWS_BOUND_CONTROLLER_LIVE_PENDING automated_run_seconds=167.615
```

## Verified contract

- a Task Flow controller runtime is bound to one Workspace, owner Conversation and controller identity;
- managed Flow creation is deterministic and request-key replay safe;
- child Message, Run, Attempt, Submission, Task classification, Flow link, revision and append-only event are committed in one SQLite transaction;
- the existing Run coordinator is invoked only after that transaction commits;
- exact child request replay returns stable Flow, Task and Run identity;
- terminal child replay is not rescheduled;
- WAITING, BLOCKED, cancellation-requested and terminal Flow states reject new child admission before writes;
- a forced mid-admission link failure rolls back every Run, Task and Flow mutation;
- Host restart rebinds the runtime and preserves Flow, Task and Run identity;
- Flow cancellation cascades through child Tasks to owning Runs;
- autonomous Goal Plan-to-Task execution remains deferred;
- Fresh dependency materialization is copied into the Fresh root and cannot resolve `@openrill/*` links back to another source tree (OR-ISSUE-246).

## Document-inclusive validation totals

```text
checks=42/42
focused_product=18/18
affected_regression=73/73
governance=139/139
canonical_files=136
canonical_tests=730/730
canonical_skipped=0
architecture=36 packages / 93 edges / 157 sources
exports=36/36
manifest=1485/1485
automated_run_seconds=167.615
```

## Windows status

```text
windows_bound_controller_live=PENDING
live_harness=STEP020C_H1_BOUND_CONTROLLER_ATOMIC_CHILD_ADMISSION_RESTART_AND_CANCELLATION
accepted_product_baseline=STEP020BR1_TASK_FLOW_OWNER_SCOPE_AND_CANCEL_ADMISSION_CLOSURE
```
