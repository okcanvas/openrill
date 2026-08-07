# OR-ISSUE-304 — Pinned revision completion contaminated mutable current Plan state

```text
STEP=STEP021BR1_PLAN_REVISION_STABLE_STEP_IDENTITY_AND_OPEN_BLOCKER_GUARD_CLOSURE
VERSION=0.21.2-step021br1
STATE_SCHEMA=24
CLASSIFICATION=PRODUCT_CONTRACT_CORRECTIVE
```

## Failure

An execution pinned to revision 1 could complete after revision 2 changed the same Step and then mark the mutable revision-2 projection completed.

## Correction

Mutable Plan projection is allowed only when pinned and current immutable definitions are semantically stable; revision-owned execution state remains independent.

## Recurrence gate

The STEP021BR1 focused Product tests, governance test, Host restart fixture, and Windows live Harness must all retain this boundary. A future implementation must not replace semantic identity or existence checks with status-only, `stepId`-only, or bounded presentation queries.
