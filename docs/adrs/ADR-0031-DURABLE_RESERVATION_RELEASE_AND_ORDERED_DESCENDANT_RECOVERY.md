# ADR-0031 — Durable reservation release and ordered descendant recovery

## Decision

Represent every child budget reservation as a durable row and release it exactly once with actual observed own-plus-descendant usage. Reuse one deepest-first terminalization path for parent cancellation and deadline timeout. Reconcile terminal and runnable child Runs at Host startup.

## Rationale

Inferring active reservation from delegation status cannot prove exactly-once parent charging. Charging the maximum reservation permanently consumes capacity that an efficient child did not use. In-memory timeout/cancellation and completion callbacks are lost on Host death. Durable reservation status, append-only delegation events, result-delivery identity and startup reconciliation close these gaps.

## Consequences

- schema advances to 14;
- parent total budgets include completed descendant use;
- active reservations reduce available capacity but are returned at terminal completion;
- default root delegation is bounded to depth 2, active children 4 and total children 8;
- public Tool count remains two;
- Protocol and UI remain unchanged until STEP014D.
