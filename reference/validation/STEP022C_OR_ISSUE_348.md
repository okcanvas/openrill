# OR-ISSUE-348 — Delivery receipt verification lacked a direct repository lookup

## Observed problem

The first receipt regression attempted to infer receipt state through unrelated delivery listing because the repository had no delivery-scoped receipt lookup.

## Correction

StateConnectorRepository now exposes getReceiptByDelivery and the regression verifies provider message, conversation, and thread identities exactly.

## Recurrence gate

`tests/unit/validation-governance-step022c.test.mjs` and the relevant STEP022C focused or Windows Live path retain this boundary.
