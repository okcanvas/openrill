# OR-ISSUE-132 — Delegation result lacked exactly-once Tool identity

## Symptom
`WAITING_DELEGATION` identified a parent and child but did not own the parent attempt, `agent.wait` Tool call, or delivery state needed to append a deterministic Tool result.

## Root cause
STEP014A intentionally stopped at wait projection foundation.

## Correction
Migration 013 adds `run_delegation_result_deliveries` with unique delegation and `(parent_run_id,parent_tool_call_id)` identities, PENDING/DELIVERED states, and result SHA-256. Completion inserts one Tool message, one `tool.completed`, one checkpoint, then marks delivery DELIVERED.

## Gate
Repeated child completion produces one parent Tool result and one checkpoint.
