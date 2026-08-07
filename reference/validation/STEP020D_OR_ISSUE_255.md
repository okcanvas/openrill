# OR-ISSUE-255 — A second focused-evidence assertion used a non-existent retention title token

## First observation

After correcting the cancellation title assertion, current governance still searched the Flow test for the literal `retention-protected`.

## Exact contradiction

The executable test title is `terminal Flow with active child stays report-only and outside retention candidates`. The intended safety contract was present and passing; only the asserted prose token was absent.

## Classification

Validation governance semantic-token drift, independently observed after OR-ISSUE-253.

## Correction

Governance now matches the actual `outside retention candidates` contract and separately checks the implementation's protected-active logic.

## Recurrence gate

Every corrected assertion is rerun in isolation before broad governance. New assertion failures are recorded independently rather than folded into an earlier symptom.
