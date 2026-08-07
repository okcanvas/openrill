# OR-ISSUE-130 — Child durable budget ignored by Kernel defaults

## Symptom
A child Run already owned a `run_budget_envelopes` row, but Kernel resolution could fall back to global default limits.

## Root cause
Execution budget selection only inspected attempt fields and caller overrides.

## Correction
`executeAgentRun()` prefers the durable budget envelope. `startExecution()` rejects a budget that differs from the envelope.

## Gate
Child integration tests run with a pre-created bounded envelope and exact budget compatibility.
