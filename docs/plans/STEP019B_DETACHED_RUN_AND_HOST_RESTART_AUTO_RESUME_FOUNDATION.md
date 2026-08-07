# STEP019B Detached Run and Host-Restart Auto-Resume Foundation

## Identity

```text
step=STEP019B_DETACHED_RUN_AND_HOST_RESTART_AUTO_RESUME_FOUNDATION
version=0.19.1-step019b
state_schema=17
parent=STEP019A_DURABLE_GOAL_PLAN_AND_LONG_RUNNING_TASK_STATE
parent_checks=38/38
parent_sha256=453eb9166858e4766343edec74a33b01d64b15b5e48decff7bb03d2f092368e6
```

## Code-audited starting point

STEP019A already committed `conversation.send` durably and returned before model completion. The missing contracts were not submission detachment itself, but execution survival and autonomous continuation:

1. normal Host close used the operator-cancel path;
2. recovered root Runs were not scheduled at startup;
3. preparation ran before recovered Attempt rollover;
4. approval resume could mutate Goal continuation state unnecessarily.

## Product flow

```text
authenticated conversation.send
→ durable user message + Run + Attempt committed
→ immediate protocol acknowledgement
→ background Agent execution
→ durable Tool result + run.checkpoint
→ Host shutdown interrupts, not cancels
→ Run becomes CREATED / RESUMABLE
→ Host starts and scans durable CREATED roots
→ fresh Attempt allocated before preparation
→ active Goal context attributed to fresh Attempt
→ existing Tool result is replayed from ledger
→ same Run reaches terminal completion
```

## Invariants

- A client connection is not the execution owner after durable send commit.
- Operator cancellation remains terminal `CANCELLED`.
- Graceful Host shutdown never masquerades as operator cancellation.
- Only a checkpoint-safe Run is automatically resumable.
- An uncheckpointed interrupted Run fails closed as `FAILED/NON_RESUMABLE`.
- A resumed Run uses a fresh Attempt before Goal/Skill preparation.
- Completed Tool calls are not executed again after restart.
- Root auto-resume does not steal delegated-child or delegation-wait ownership.
- Startup recovery also closes the send-commit/in-memory-schedule crash window.
- State schema remains 17; this Step needs no migration.

## Deliberate limits

This is not a general workflow engine, distributed lease scheduler, cron replacement, Plugin controller, cross-machine worker queue, arbitrary instruction-pointer checkpoint, or resumable in-flight external Tool transaction. Recovery remains fail-closed outside the existing durable checkpoint boundary.

External model, Browser live, Mattermost and Connector are not required for STEP019B promotion.
