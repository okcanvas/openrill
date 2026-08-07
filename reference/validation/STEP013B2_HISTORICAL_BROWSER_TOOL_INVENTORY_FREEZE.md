# OR-ISSUE-098 — historical Browser Tool inventory freeze

## Exact symptom

After adding the six STEP013B2 interaction Tools, the retained STEP013B1 focused tests failed even though the original six read-only Tools were still present in their original order.

## Code-confirmed root cause

Historical STEP013B1 tests and both STEP013B1/B1A acceptance runners compared the complete current registration list to an exact six-item array. That assertion tested “the repository can never add another Browser Tool” rather than “the STEP013B1 feature remains retained.”

## Impact

A correct additive public Tool extension was classified as a regression. The same defect could force future developers to weaken or delete historical tests instead of preserving the original capability contract.

## Fix

Historical gates now verify the retained six-tool prefix/subset. STEP013B2 owns the new exact 12-tool inventory. No old marker or historical accepted artifact is rewritten.

## Recurrence-prevention gates

- `browser-interaction-boundaries-step013b2.test.mjs` inspects both historical tests and both historical acceptance runners;
- historical gates must use subset/prefix logic;
- the current STEP alone owns exact current inventory assertions.
