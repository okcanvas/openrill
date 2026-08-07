# OR-ISSUE-261 — Schema 21 terminal child Tasks had no completion delivery after upgrade

## First observation

A real schema-21 fixture with an active, owner-matched Flow and an already `SUCCEEDED` child Task migrated to schema 22 with `DONE_ONLY` but zero delivery rows. The controller would remain permanently asleep.

## Direct cause

Migration 22 initially changed Task defaults and created the new delivery table but only future terminal transitions inserted delivery intents.

## Correction

Migration 22 backfills one delivery from the latest terminal Task event only when the Flow is active, non-cancelling, same-Workspace and owner-matched. Historical success is conservatively marked `terminalOutcome=BLOCKED` and requires controller review. Terminal, cancelling, and owner-mismatched Flows are excluded.

## Recurrence gate

Every new durable continuation ledger requires an upgrade fixture from the immediately accepted schema and must prove both safe backfill and unsafe-case exclusion.
