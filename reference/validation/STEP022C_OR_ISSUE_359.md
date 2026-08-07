# OR-ISSUE-359 — Historical STEP022B governance reclaimed the current root source version

## Observed problem

After STEP022C advanced the root package to `0.24.0-step022c`, the first STEP022B governance test still required the mutable root `package.json` to equal `0.23.0-step022b`. The durable Connector behavior and schema-25 tests passed; only historical ownership failed.

## Correction

STEP022B now validates its immutable live-marker contract, package script, migration semantics, and accepted STEP021BR2 baseline. The current root source identity is owned only by STEP022C governance.

## Recurrence gate

Every historical STEP must validate immutable artifacts or additive behavior, never the mutable current package identity.
