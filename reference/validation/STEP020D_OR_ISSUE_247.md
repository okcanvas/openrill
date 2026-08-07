# OR-ISSUE-247 — LOST design assumed a Task could outlive a deleted Run row

## First observation

The initial STEP020D design listed `active Task + missing owning Run` as a LOST candidate before checking the accepted schema.

## Exact contradiction

Migration 018 owns `background_tasks.run_id REFERENCES agent_runs(run_id) ON DELETE CASCADE`. Deleting the Run row also deletes the Task row, so the proposed orphan state cannot exist under the current database contract.

## Classification

Design/SOT error caught by code audit before acceptance.

## Correction

LOST is based on runtime authority after Host recovery: an active Run remains durable, recovery grace expires, runtime authority exists, and the Run is neither active nor intentionally idle. The owning Run is then failed NON_RESUMABLE and its Task projection becomes LOST in the same lifecycle path.

## Recurrence gate

Governance asserts the cascade FK, the runtime-authority predicates, recovery grace, and `markExecutionLost` integration. Documentation must not claim missing-Run orphan recovery for the accepted schema.
