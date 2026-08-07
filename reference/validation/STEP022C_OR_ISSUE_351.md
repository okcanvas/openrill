# OR-ISSUE-351 — Substring mention matching routed messages for another username

## Observed problem

A simple string contains check could treat @openrillx as a mention of @openrill.

## Correction

Routing uses an escaped boundary-aware mention expression and regression covers exact punctuation and false-prefix cases.

## Recurrence gate

`tests/unit/validation-governance-step022c.test.mjs` and the relevant STEP022C focused or Windows Live path retain this boundary.
