# OR-ISSUE-347 — POST transport failure was initially classified as definitely not sent

## Observed problem

Once fetch is invoked for a POST, a thrown transport error or timeout cannot prove that the remote server did not accept the request.

## Correction

Delivery requests mark dispatch before invoking fetch. Transport ambiguity becomes MAYBE_ACCEPTED and is quarantined without automatic replay.

## Recurrence gate

`tests/unit/validation-governance-step022c.test.mjs` and the relevant STEP022C focused or Windows Live path retain this boundary.
