# OR-ISSUE-342 — Terminal Connector Run output was not projected to an outbound delivery

## Observed problem

A Connector-origin Run could complete with an assistant message, but no lifecycle hook converted that terminal output back to the original channel and thread.

## Correction

ConnectorRuntimeService now resolves the ingress and binding by Run, creates one idempotent logical delivery, and Host drains it on terminal completion and startup recovery.

## Recurrence gate

`tests/unit/validation-governance-step022c.test.mjs` and the relevant STEP022C focused or Windows Live path retain this boundary.
