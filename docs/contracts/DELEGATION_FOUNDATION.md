# Delegation Foundation Contract

## Ownership

- `packages/state`: schema, repositories, immutable rows/events.
- `packages/conversations`: validation, atomic graph creation, transitions, waits, cancellation order.
- `packages/agent-kernel`: cumulative token/time enforcement.
- Agent Host/Tool/Protocol/UI: no new delegation surface in STEP014A.

## Identity graph

Every budget envelope has `runId`, `rootRunId`, optional `parentRunId`, and `depth`. Root rows satisfy `rootRunId = runId`, `parentRunId = NULL`, `depth = 0`. Child rows are created only together with a fresh child Conversation, user task message, Agent Run, attempt, budget envelope, delegation row, event, and idempotency submission in one immediate transaction.

## Privacy

- task text exists only in the child Conversation message;
- the delegation row stores SHA-256 only;
- result summary is stored as SHA-256 only in this foundation;
- scope arrays are bounded and canonicalized;
- no prompt, reasoning, Secret, raw Tool argument, or unbounded output enters delegation events.

## Budget evidence

Configured ceilings and observed usage are different facts. Observed usage columns accept any non-negative actual value. The kernel emits a typed budget terminal reason after persistence. This prevents a database constraint from masking the real budget error.

## Wait projection

`run_delegation_waits.state` is exactly `WAITING_DELEGATION`. A terminal delegation transition deletes its wait. Restart classification checks this durable projection.

## Transition graph

```text
CREATED → RUNNING | FAILED | CANCELLED | TIMED_OUT
RUNNING → WAITING | COMPLETED | FAILED | CANCELLED | TIMED_OUT
WAITING → RUNNING | COMPLETED | FAILED | CANCELLED | TIMED_OUT
terminal → no transition
```

Events are append-only. Cancellation ordering returns active descendants deepest-first.
