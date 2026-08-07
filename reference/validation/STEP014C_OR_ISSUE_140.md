# OR-ISSUE-140 — Public spawn always disabled nested delegation

## Symptom and code-confirmed cause

STEP014B generated child envelopes with zero child capacity and stripped delegation Tools, even when the durable parent depth/scope allowed nesting.

## Correction

`maxNestedDepth` derives a bounded child depth and only adds `agent.spawn`/`agent.wait` when the parent durable Tool scope permits both.

## Recurrence gate

`delegation-nested-recovery-step014c.test.mjs` and `delegation-nested-recovery-boundaries-step014c.test.mjs` retain the exact runtime or source boundary for this issue.
