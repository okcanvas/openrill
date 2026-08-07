# ADR-0029 — Durable delegation foundation before public Tools

## Status

Accepted for STEP014A.

## Context

The existing Agent Kernel had per-request output limits and Run turn/model/Tool counters but no cumulative token/time/depth/child envelope, no parent/root graph, and no durable delegation wait. Publishing a spawn Tool first would create crash, authority, and duplicate-child ambiguity.

## Decision

Introduce schema 12 durable graph, budget, events, wait projection, transition rules, restart classification, and cancellation order before publishing `agent.spawn` or `agent.wait`.

## Consequences

- STEP014A is deterministic foundation only.
- STEP014B can use stable idempotency and wait ownership.
- Historical `agent_runs` status schema is not rewritten.
- Child authority is a strict subset of parent authority.
