# OR-ISSUE-356 — Host test replaced global WebSocket and broke Local Protocol

## Observed problem

The first vertical fixture replaced globalThis.WebSocket for every URL, intercepting the Host's own Local Protocol client and omitting standard ready-state constants.

## Correction

The fixture delegates non-Mattermost URLs to the original implementation and preserves CONNECTING, OPEN, CLOSING, and CLOSED constants.

## Recurrence gate

`tests/unit/validation-governance-step022c.test.mjs` and the relevant STEP022C focused or Windows Live path retain this boundary.
