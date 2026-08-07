# ADR-0030 — Separate non-blocking spawn from durable wait

## Decision
Use two closed Tools, `agent.spawn` and `agent.wait`, rather than a blocking delegate Tool.

## Rationale
A Tool that waits in process memory would lose its completion boundary on Host death. Spawn creates a durable child and returns a checkpoint. Wait owns an explicit durable suspension identity. Child completion can then deliver exactly once and resume the parent.

## Consequences
STEP014B supports one child and depth 1 only. Nested fan-out, cascade cancellation, restart races beyond the single child, Protocol and UI are deferred to STEP014C/D.
