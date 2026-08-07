# OR-ISSUE-354 — Adapter diagnostics could forge connector identity or doctor summary

## Observed problem

A Connector could return another connectorId or claim ok=true while one check failed.

## Correction

Registry normalization requires the registered connector identity and derives consistency by requiring ok to equal all-checks-passed.

## Recurrence gate

`tests/unit/validation-governance-step022c.test.mjs` and the relevant STEP022C focused or Windows Live path retain this boundary.
