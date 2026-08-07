# STEP019A Durable Goal, Plan and Long-Running Task State

## Identity

```text
step=STEP019A_DURABLE_GOAL_PLAN_AND_LONG_RUNNING_TASK_STATE
version=0.19.0-step019a
state_schema=17
parent=STEP018C_AGENT_TASK_CAPABILITY_BENCHMARK
parent_checks=WINDOWS_AGENT_BENCHMARK_36/36
parent_sha256=ebc745a8f109cc4dc6cc3d37ea9992adfeb0a7fb3d49920bc22892110a07809d
```

## Product objective

Allow one Conversation to carry a durable multi-turn objective and ordered plan across Host and SQLite restart, with explicit progress, blocker, pause/resume/cancel and evidence-backed completion.

## State

- `agent_goals`: objective, lifecycle, blocker fingerprint/count, continuation count, revision and provenance.
- `agent_goal_plan_steps`: ordered steps, progress state, notes, revision and provenance.
- `agent_goal_events`: append-only sequence of durable transition evidence.

## Agent tools

```text
goal.create
goal.get
plan.set
plan.update
goal.report_blocker
goal.control
goal.complete
```

All tools execute through the existing ToolRegistry. They do not bypass Workspace isolation, approval, cancellation, timeout, durable Run scope or delegated Tool restrictions.

## Required invariants

- at most one open goal per Conversation;
- one to twenty unique ordered plan steps;
- CAS on goal and step mutations;
- prior steps complete before a later step advances;
- every step complete before the goal completes;
- identical blocker reported three consecutive goal turns before `BLOCKED`;
- only explicit user control resumes, pauses or cancels;
- root Run receives active-goal context after restart;
- delegated child Run does not silently inherit parent goal context;
- Workspace, Conversation, Run and Attempt provenance must exist and agree.

## Validation

- focused Product tests for State, CAS, ordering, blocker recurrence, restart and Tool scope;
- actual Host restart with a scripted local model;
- Windows live lane with no external API cost;
- retained STEP018C benchmark and Agent capability regression;
- package manifest, source identity, workspace links, architecture and exports.

## Non-goals

No detached task executor, Task Flow Plugin controller, background workflow scheduler, network distribution, UI, external model, Browser live, Mattermost, or Connector is implemented in STEP019A. Mattermost and Connector work remains speculative and deferred until an executable real system and a real adapter contract exist.
