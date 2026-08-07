# OR-ISSUE-139 — Delegation reservation lacked durable exactly-once release

## Symptom and code-confirmed cause

Active capacity was inferred from child/delegation state and reserved maxima had no durable release/charge identity.

## Correction

One reservation row per delegation changes RESERVED to RELEASED once and atomically increments parent actual usage; conflicting replay fails closed.

## Recurrence gate

`delegation-nested-recovery-step014c.test.mjs` and `delegation-nested-recovery-boundaries-step014c.test.mjs` retain the exact runtime or source boundary for this issue.
