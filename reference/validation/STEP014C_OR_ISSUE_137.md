# OR-ISSUE-137 — Historical STEP014B schema ownership froze current schema 13

## Symptom and code-confirmed cause

Retained STEP014B tests asserted the global current schema was exactly 13, so additive migration 014 failed despite preserving migration 013.

## Correction

Retained tests now assert schema >=13 and exact presence of migration 013; STEP014C alone owns exact schema 14.

## Recurrence gate

`delegation-nested-recovery-step014c.test.mjs` and `delegation-nested-recovery-boundaries-step014c.test.mjs` retain the exact runtime or source boundary for this issue.
