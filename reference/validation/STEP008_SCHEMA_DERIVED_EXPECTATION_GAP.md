# STEP008 Schema-Derived Expectation Gap

## Issue

`OR-ISSUE-015`

## Exact symptom

After migration `005_workspace_file_artifacts.sql` raised the current schema from 4 to 5, the full unit suite failed:

```text
Expected: schemaVersion: 4
Actual:   schemaVersion: 5
```

The failing assertion was in `tests/unit/state-step005.test.mjs` even though the same test file already imported `OPENRILL_STATE_SCHEMA_VERSION` and used it for the migration sequence.

## Code-confirmed root cause

The STEP007 repair for `OR-ISSUE-012` only replaced the hardcoded migration inventory and future-version fixture. The state identity object assertion retained the literal `schemaVersion: 4`. The previous recurrence gate checked only the two repaired expressions and therefore gave a false sense of full coverage.

## Impact

Every legitimate schema extension could still break a historical test. More importantly, the recurrence gate did not cover the whole failure class it claimed to prevent.

## Fix

The identity assertion now uses:

```text
schemaVersion: OPENRILL_STATE_SCHEMA_VERSION
```

The current live regression markers report schema 5.

## Recurrence-prevention gate

STEP008 acceptance checks the identity assertion, migration sequence, and future-version fixture together and rejects the stale literal `schemaVersion: 4` from active tests.
