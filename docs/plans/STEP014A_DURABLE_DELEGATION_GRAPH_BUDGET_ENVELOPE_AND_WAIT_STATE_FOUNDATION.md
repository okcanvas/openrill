# STEP014A — DURABLE_DELEGATION_GRAPH_BUDGET_ENVELOPE_AND_WAIT_STATE_FOUNDATION

## Identity

- Step: `STEP014A_DURABLE_DELEGATION_GRAPH_BUDGET_ENVELOPE_AND_WAIT_STATE_FOUNDATION`
- Version: `0.14.0-step014a`
- State schema: `12`
- Accepted baseline: `STEP013CR2_SQLITE_NULL_PROTOTYPE_LIVE_ASSERTION_ALIGNMENT`
- Baseline checks: `163/163`
- Baseline ZIP SHA-256: `c4314c2c9c877f503fc6bb84e04f5abc698f22c8e9104c826b7f0e2d328904fc`

## Purpose

Create the durable data, budget, wait, transition, and restart-classification foundation required before any public delegated-work Tool is exposed.

STEP014A does not claim delegated execution. It makes the future `agent.spawn`/`agent.wait` implementation possible without weakening STEP013C crash/restart guarantees.

## Included

1. Promote STEP013CR2 as the machine-owned accepted baseline.
2. Pin an OpenClaw delegated-work source audit with exact file hashes and explicit differences.
3. Add migration 012 and schema 12.
4. Add durable root/parent/depth identity and append-only delegation events.
5. Add total-token, wall-clock, depth, active-child, total-child, and scope envelopes.
6. Add provider-neutral `WAITING_DELEGATION` projection without rewriting the historical `agent_runs` status CHECK.
7. Add idempotent atomic child Conversation/Run creation behind an internal service only.
8. Enforce monotonic scope and budget inheritance.
9. Persist actual observed usage even when it exceeds a configured ceiling so typed failure evidence is not lost.
10. Sum turn usage across restart attempts.
11. Add validated delegation state transitions, terminal wait cleanup, and deepest-first cancellation ordering.
12. Treat a durable delegation wait as restart-resumable.

## Durable tables

- `run_budget_envelopes`
- `run_delegations`
- `run_delegation_events`
- `run_delegation_waits`

The child task is owned by the child Conversation message. The delegation row stores only `task_sha256`.

## Budget contract

Configured limits:

- `maxTurns`
- `maxModelCalls`
- `maxToolCalls`
- `maxOutputTokens`
- `maxTotalTokens`
- `maxDurationMs`
- `maxDelegationDepth`
- `maxActiveChildren`
- `maxTotalChildren`

Observed usage is non-negative audit evidence and may exceed the configured ceiling by the amount reported in a completed provider turn. Enforcement occurs in the service/kernel boundary; SQLite must not reject the evidence row.

Inheritance invariants:

```text
child workspace set ⊆ parent workspace set
child skill set     ⊆ parent skill set
child Tool set      ⊆ parent Tool set
child limits        ≤ parent limits
child deadline      ≤ parent deadline
child reservation   ≤ parent remaining capacity
```

## Wait and recovery contract

`WAITING_DELEGATION` is an authoritative projection in `run_delegation_waits`; it is not added to the historical `agent_runs.status` CHECK in this stage.

On restart, an incomplete Run with an active durable delegation wait is classified `CREATED/RESUMABLE`. STEP014B will own result delivery and parent resume.

## Public surface

Unchanged in STEP014A:

- Browser Tools: 15
- no `agent.spawn`
- no `agent.wait`
- no delegation protocol operation
- no Control UI delegation tree

## Acceptance

- accepted baseline identity exact
- schema 12 and all four tables real
- root budget replay/conflict
- atomic child Conversation/Run/budget/delegation/event
- no raw task in delegation ledger
- idempotency conflict
- scope non-escalation
- depth/active/total child limits
- remaining capacity and deadline inheritance
- durable wait reopen/restart classification
- total-token and wall-clock enforcement
- observed overshoot evidence persistence
- attempt turn aggregation by SUM
- valid transition graph and terminal wait cleanup
- deepest-first cancellation ordering
- no public delegation Tool or protocol operation
- canonical, architecture, exports, manifest, deterministic package, fresh ZIP

## Excluded

- public delegated-work Tools
- child scheduler execution
- parent result delivery
- nested/parallel execution
- cancellation execution cascade
- Protocol and Control UI
- distributed workers

## Next stages

- STEP014B: single-child spawn/wait and durable parent resume
- STEP014C: bounded nested/parallel execution, timeout, cancellation, restart delivery
- STEP014D: Protocol, Control UI, and Windows vertical slice
