# STEP019A Windows Goal Live Acceptance

## Accepted identity

```text
STEP019A_DURABLE_GOAL_PLAN_AND_LONG_RUNNING_TASK_STATE
version=0.19.0-step019a
state_schema=17
checks=38/38
artifact=openrill-step019a-h1-state-schema-source-of-truth-alignment-v1.zip
sha256=453eb9166858e4766343edec74a33b01d64b15b5e48decff7bb03d2f092368e6
live_harness=STEP019A_H1_STATE_SCHEMA_SOURCE_OF_TRUTH_ALIGNMENT
```

## Actual Windows marker supplied by the operator

```text
checks=38/38
state=PASSED
version=0.19.0-step019a
schema=17
windows_goal_live=PASSED
live_harness=STEP019A_H1_STATE_SCHEMA_SOURCE_OF_TRUTH_ALIGNMENT
promotion=READY
automated_run_seconds=147.749
```

## Promoted Product contract

- Conversation-owned durable Goal.
- Revisioned ordered Plan.
- Checkpointed task state.
- Goal context restored after Host restart.
- Three identical blockers transition the Goal to `BLOCKED`.
- Goal completion is rejected until every Step is complete.
- Workspace, Conversation, Run and Attempt provenance.
- OpenClaw Goal and Task Flow source audit retained as an answer key, not a Product dependency.
- Canonical `650/650` passed.

## Intentional exclusions

```text
external_model=NOT_RUN
browser_live=NOT_RUN
connector=DEFERRED_NO_REAL_SYSTEM
```

This file records operator-supplied Windows evidence. It does not reconstruct or invent an unavailable raw console log.
