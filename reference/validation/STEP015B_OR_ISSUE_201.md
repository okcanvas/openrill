# OR-ISSUE-201 — Exact-schema recurrence was not swept across the historical suite

## First observed

Immediately after OR-ISSUE-200 corrected one STEP014C boundary file, the next canonical file failed
on another exact schema 14 assertion.

## Evidence

The second failure was:

```text
migration 014 owns durable reservation release and delegated usage columns
15 !== 14
```

A repository-wide search then found the same mutable-current-schema ownership in seven additional
historical tests:

- STEP014C runtime migration test;
- STEP014DR2 boundary;
- STEP014DR5 boundary;
- STEP014DR6 boundary;
- STEP014DR7 boundary;
- STEP014DR7 live-acceptance closure boundary;
- STEP014DR8 Vue/browser closure boundary.

## Direct cause

OR-ISSUE-200 was corrected file-by-file instead of first sweeping all historical tests for the same
exact-schema pattern. That repeated the reactive DR method the practical validation policy was
created to prevent.

## Classification

```text
class=HARNESS_RECURRENCE_PREVENTION_SWEEP_INCOMPLETE
product_runtime_defect=NO
source_package_blocking=YES
recurrence_of=OR-ISSUE-137,OR-ISSUE-194,OR-ISSUE-200
```

## Correction

The entire historical test tree was audited. Historical STEP014 tests now own:

- immutable migration 014 presence and content;
- minimum schema lineage `>=14`;
- their Tool, Protocol, UI, and acceptance boundaries.

They no longer own the mutable latest schema or require migration 014 to remain the final migration.

## Recurrence gate

STEP015B governance scans the historical unit-test tree and rejects executable assertions that
require the current State schema exactly 14. When a recurrence class is found, the class must be
searched repository-wide before canonical validation resumes.
