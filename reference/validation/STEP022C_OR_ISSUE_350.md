# OR-ISSUE-350 — Doctor initially checked only URL derivation instead of opening a WebSocket

## Observed problem

A syntactically valid target did not prove that the WebSocket endpoint could be opened or accept an authentication challenge.

## Correction

Doctor performs REST /users/me authentication and a bounded real WebSocket open plus authentication_challenge send. Windows Live additionally proves actual posted-event receipt.

## Recurrence gate

`tests/unit/validation-governance-step022c.test.mjs` and the relevant STEP022C focused or Windows Live path retain this boundary.
