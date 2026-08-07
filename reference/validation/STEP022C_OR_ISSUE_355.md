# OR-ISSUE-355 — Connector status and doctor were not available through Local Protocol

## Observed problem

The durable ledger could be inspected, but operators could not determine whether the real transport was connected or diagnose authentication and WebSocket reachability.

## Correction

Closed connector.status and connector.doctor operations were added with strict input and output validation and redacted public projections.

## Recurrence gate

`tests/unit/validation-governance-step022c.test.mjs` and the relevant STEP022C focused or Windows Live path retain this boundary.
