# OR-ISSUE-163 — Retained STEP014DR1 test froze the mutable current release identity

## Symptom

After STEP014DR2 correctly advanced the root version, the retained STEP014DR1 boundary test failed because it still required `package.json` to equal `0.14.4-step014dr1`.

## Cause

The historical test combined two different owners: immutable STEP014DR1 evidence/entrypoints and mutable current package identity. Every corrective successor would therefore be rejected.

## Correction

The test now preserves the STEP014DR1 plan/version and acceptance/package entrypoints while explicitly allowing the current root release to advance. STEP014DR2 alone owns exact current identity.

## Recurrence gate

The retained test verifies immutable DR1 plan evidence and scripts, and verifies the current root is not falsely pinned to DR1.
