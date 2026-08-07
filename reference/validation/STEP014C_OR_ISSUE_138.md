# OR-ISSUE-138 — Completed child usage was absent from parent total budget

## Symptom and code-confirmed cause

STEP014B child completion delivered a result but the parent envelope contained only its own usage, allowing descendants to exceed the root total token/turn/model/Tool ceilings.

## Correction

Schema 14 stores delegated usage counters and Kernel enforcement sums own and completed descendant usage.

## Recurrence gate

`delegation-nested-recovery-step014c.test.mjs` and `delegation-nested-recovery-boundaries-step014c.test.mjs` retain the exact runtime or source boundary for this issue.
