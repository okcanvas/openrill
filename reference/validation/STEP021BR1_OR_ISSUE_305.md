# OR-ISSUE-305 — Open-blocker safety used a bounded presentation query

```text
STEP=STEP021BR1_PLAN_REVISION_STABLE_STEP_IDENTITY_AND_OPEN_BLOCKER_GUARD_CLOSURE
VERSION=0.21.2-step021br1
STATE_SCHEMA=24
CLASSIFICATION=PRODUCT_CONTRACT_CORRECTIVE
```

## Failure

Adoption scanned `listBlockers(..., 200)`, so an OPEN blocker beyond the first 200 historical rows could be missed.

## Correction

A dedicated unbounded existence query `getAnyOpenBlocker` now owns the adoption safety decision; paged lists are presentation-only.

## Recurrence gate

The STEP021BR1 focused Product tests, governance test, Host restart fixture, and Windows live Harness must all retain this boundary. A future implementation must not replace semantic identity or existence checks with status-only, `stepId`-only, or bounded presentation queries.
