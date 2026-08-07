# Delegation nesting, parallelism, and recovery contract

## Reservation

Each child owns one `run_delegation_budget_reservations` row. Creation reserves maximum turns, model calls, Tool calls and total tokens atomically with the child graph. Active capacity is computed only from rows whose status is `RESERVED`.

## Release and charge

A terminal child changes its reservation from `RESERVED` to `RELEASED` exactly once. The parent is charged the child's observed own usage plus usage already charged from descendants. Reserved maxima are not charged. Replay must match the persisted reason and exact usage or fail closed.

## Nested scope

A child may delegate only when:

- its depth is below `maxDelegationDepth`;
- the parent durable Tool scope contains both `agent.spawn` and `agent.wait`;
- requested Workspace, Skill and ordinary Tool scope is a subset of the parent scope;
- active, total-child and remaining-budget limits permit creation.

The model-visible Tool schema and dispatch boundary use the same durable scope.

## Parallelism

`agent.spawn` remains non-blocking. Multiple child Runs may be scheduled in parallel only within `maxActiveChildren`. `maxTotalChildren` is a lifetime cap and is independent from the active cap.

## Cancellation and timeout

Cancellation order is deepest-first. For every descendant, Host first cancels owned approval/process/Browser/coordinator resources and then terminalizes the child. Timeout uses the same ordered terminalization path with status `TIMED_OUT` and typed error `DELEGATION_TIMEOUT`.

## Restart

At Host startup:

1. terminal child Runs with incomplete result delivery are reconciled;
2. exactly-once Tool result/checkpoint delivery is replayed safely;
3. child Runs in durable `CREATED` state without an active delegation wait are scheduled;
4. a child waiting on its own descendant is not scheduled until that result is delivered.

Raw task, child transcript, reasoning, secrets and unbounded Tool output are not propagated to the parent.
