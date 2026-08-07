# OR-ISSUE-344 — Mattermost activation draft awaited the reconnect loop forever

## Observed problem

The first activation draft treated the long-lived WebSocket reconnect loop as the activation promise, so a healthy Connector could never reach Extension READY.

## Correction

Runtime start launches the reconnect loop in the background and awaits only authenticated REST identity plus the first WebSocket connection deadline.

## Recurrence gate

`tests/unit/validation-governance-step022c.test.mjs` and the relevant STEP022C focused or Windows Live path retain this boundary.
