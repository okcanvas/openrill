# OR-ISSUE-142 — Delegated child deadline had no Host orchestration

## Symptom and code-confirmed cause

Durable child deadlines existed, but no Host owner scanned expired active delegations and produced a terminal child result.

## Correction

A bounded Host sweep identifies expired subtrees and reuses deepest-first terminalization with `TIMED_OUT/DELEGATION_TIMEOUT`.

## Recurrence gate

`delegation-nested-recovery-step014c.test.mjs` and `delegation-nested-recovery-boundaries-step014c.test.mjs` retain the exact runtime or source boundary for this issue.
