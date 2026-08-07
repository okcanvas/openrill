# OR-ISSUE-346 — Mattermost startup deadline could exceed the Host Extension activation budget

## Observed problem

A request timeout as high as 120 seconds could leave activation waiting beyond the Host's ten-second lifecycle boundary.

## Correction

First WebSocket startup wait is bounded to at most eight seconds, leaving cleanup time inside the Host activation timeout.

## Recurrence gate

`tests/unit/validation-governance-step022c.test.mjs` and the relevant STEP022C focused or Windows Live path retain this boundary.
