# OR-ISSUE-345 — Connector registration and explicit capability claim could double-claim Mattermost

## Observed problem

The Extension contract already assigns connector capability ownership to registerConnector; an additional claimCapability call caused a duplicate capability conflict.

## Correction

Mattermost uses registerConnector as the sole connector claim. Tests make claimCapability throw to prove it is not called.

## Recurrence gate

`tests/unit/validation-governance-step022c.test.mjs` and the relevant STEP022C focused or Windows Live path retain this boundary.
