# STEP012D accepted-baseline version stale false positive

## Issue

`OR-ISSUE-071 — ACCEPTED_BASELINE_VERSION_MISCLASSIFIED_AS_STALE_CURRENT_CANDIDATE`

## Exact symptom

The first STEP012D local acceptance passed the current STEP/version, accepted STEP/SHA, focused tests, canonical `215/215`, and both manifest checks, but failed:

```text
[FAIL] baseline-stale-zero:README.md
```

`README.md` correctly contained `version=0.12.5-step012cr1` inside the immutable official accepted-baseline record.

## Code-confirmed root cause

`run_step012d_acceptance.py` defined stale current ownership as either:

```text
current_candidate=STEP012CR1
or
version=0.12.5-step012cr1
```

The second predicate ignored document context. The accepted baseline must retain its actual version, so a valid historical evidence value was treated as a stale current-candidate claim.

## Affected path

```text
current STEP012D README
+ immutable STEP012CR1 accepted baseline/version
→ context-free stale literal scan
→ false acceptance failure
```

## Impact

The current candidate could not honestly retain the accepted artifact version in README. Removing the accepted version would weaken handoff and immutable artifact traceability.

## Fix

- Current candidate identity is already positively checked as STEP012D/version `0.12.6-step012d`.
- Stale-current detection now rejects only explicit old current-candidate ownership forms, not accepted-baseline version evidence.
- Accepted STEP012CR1 version/SHA/marker remain required.

## Automated recurrence-prevention gate

Acceptance requires current STEP012D identity and exact STEP012CR1 accepted evidence simultaneously, while the stale-zero predicate is scoped only to old current-candidate claims.
