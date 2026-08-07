# STEP021A — Durable Goal Plan to Task Flow Executor Foundation

## Identity

```text
step=STEP021A_DURABLE_GOAL_PLAN_TO_TASK_FLOW_EXECUTOR_FOUNDATION
version=0.21.0-step021a
state_schema=23
accepted_baseline=STEP020ER3_WINDOWS_PYTHON_LIVE_MARKER_VALIDATOR_ENTRYPOINT_CLOSURE
```

## Problem

STEP019A made Goal and ordered Plan durable. STEP020A–STEP020ER3 made detached Task, controller-owned Task Flow, atomic child admission, recovery, completion delivery and controller wake durable. No production path connected a Plan Step to the Task Flow runtime. Plan remained intent; execution required a caller to assemble the loop manually.

## Constitutional separation

```text
Goal/Plan = durable intent and order
Step execution = durable projection of one Plan revision
Task = one actual Run-linked execution fact
Task Flow = controller-owned orchestration state
Run = execution source of truth
```

A Plan Step is never converted into a Task record. One Step can have multiple Task attempts after an explicit resume.

## Product contract

- one Goal execution owns one deterministic Conversation-bound Task Flow;
- execution snapshots one untouched Plan revision;
- one active Step and one active child Task maximum;
- first Step becomes READY and is atomically admitted on start;
- Message, Run, Attempt, Submission, Task, Flow link, Step binding, execution projection and event commit together;
- semantic `SUCCEEDED` advances only the next ordered Step to READY;
- semantic `BLOCKED` blocks Step, Plan, execution, Flow and Goal;
- completion delivery wakes the bound controller, which explicitly runs the next Step or finishes/blocks/fails/cancels;
- restart restores exact Goal/Flow/Step/Task/Run identity and never duplicates admission;
- all required Steps must be SUCCEEDED or explicitly SKIPPED before Goal completion;
- generic Task Flow mutation cannot bypass the Goal executor;
- generic Goal/Plan mutation is closed once execution ownership is established;
- cancellation projection is replay-safe after a crash between Flow cancellation and Goal projection.

## Intentionally deferred

- parallel Step execution;
- general DAG scheduler;
- automatic retry policy;
- model-driven dynamic Plan rewriting;
- periodic distributed workers or leader election;
- browser UI;
- external model LIVE;
- real connector LIVE.

## Windows LIVE target

The Windows Harness must prove start, ordered Step admission, semantic success, controller continuation, Host restart with same active Task/Run, blocked Step with no later admission, explicit resume with a new Task attempt, cancellation projection recovery, and completion only after all required Steps.
