# OR-ISSUE-200 — STEP014C boundary still froze the mutable current State schema

## First observed

STEP015B canonical package-candidate validation after OR-ISSUE-199.

## Symptom

`delegation-nested-recovery-boundaries-step014c.test.mjs` required:

```text
OPENRILL_STATE_SCHEMA_VERSION = 14 as const
```

State schema 15 correctly adds Process backend/confinement evidence, so the historical test failed.

## Direct cause

The STEP014C boundary correctly retained immutable migration 014 content, but also asserted the
mutable current schema constant. Existing recurrence prevention had already declared that exact
schema 14 belonged historically to STEP014C, yet the executable test was not aligned with that
ownership rule.

## Classification

```text
class=HARNESS_HISTORICAL_CURRENT_SCHEMA_FREEZE
product_runtime_defect=NO
source_package_blocking=YES
recurrence_of=OR-ISSUE-137,OR-ISSUE-194
```

## Correction

The STEP014C test continues to verify migration 014, migrations 012/013 immutability, reservation
release, nested limits, and recovery. It now requires only that the current State schema is at least
14, allowing later append-only migrations.

## Recurrence gate

A historical migration test may own its immutable migration file and minimum supported lineage,
but may not own the mutable current schema constant. Exact current schema is owned only by the
current STEP focused tests.
