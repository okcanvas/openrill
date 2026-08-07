# Single-child delegated execution contract

## Tool surface
`agent.spawn` accepts task, expected output, bounded child limits and optional reduced Tool names. It returns identities/status only. `agent.wait` accepts only `delegationId`.

## Authority
The child uses the same workspace, no Skills, a Tool subset excluding delegation Tools, depth 1, active child 1, total child 1. Kernel filters both model schemas and execution dispatch.

## Persistence
Migration 012 owns graph/budget/wait. Migration 013 owns PENDING/DELIVERED result delivery keyed by delegation and parent Tool call.

## Result projection
The parent receives status, expected output, at most 8,192 summary characters, at most 32 Artifact references, aggregate usage, typed error code, and truncation flag. No reasoning or raw transcript is included.

## Resume
Waiting marks the current attempt `ABORTED` with `DELEGATION_WAIT`, preserves the attempt pointer and sets the Run to `CREATED/RESUMABLE`. Delivery appends a durable Tool result/checkpoint. `startExecution()` creates attempt 2.
