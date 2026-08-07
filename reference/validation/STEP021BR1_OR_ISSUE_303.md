# OR-ISSUE-303 — Changed completed Step was preserved by status-only adoption

```text
STEP=STEP021BR1_PLAN_REVISION_STABLE_STEP_IDENTITY_AND_OPEN_BLOCKER_GUARD_CLOSURE
VERSION=0.21.2-step021br1
STATE_SCHEMA=24
CLASSIFICATION=PRODUCT_CONTRACT_CORRECTIVE
```

## Failure

STEP021B adoption used terminal status and matching `stepId` without comparing immutable Step definitions.

## Correction

Adoption now requires semantic equality of `stepId`, `title`, `required`, `retryMode`, and `maxAttempts`; changed/new Steps receive fresh execution history.

## Recurrence gate

The STEP021BR1 focused Product tests, governance test, Host restart fixture, and Windows live Harness must all retain this boundary. A future implementation must not replace semantic identity or existence checks with status-only, `stepId`-only, or bounded presentation queries.
