# OR-ISSUE-199 — Historical timeout test froze the complete execution config object

## First observed

STEP015B canonical package-candidate validation.

## Symptom

`tests/unit/approval-timeout-separation-step011r5.test.mjs` expected the complete materialized
`execution` object to contain exactly:

```text
approvalMode
defaultTimeoutMs
approvalTimeoutMs
```

STEP015B legitimately added backend, fallback, mount, network, and Docker defaults, so the
historical exact-object assertion failed.

## Direct cause

A STEP011R5 test owned the mutable future shape of `execution` instead of owning only its historical
responsibility: independent process and approval timeout defaults.

## Classification

```text
class=HARNESS_HISTORICAL_CURRENT_OBJECT_FREEZE
product_runtime_defect=NO
source_package_blocking=YES
```

## Correction

The historical test now asserts only:

```text
approvalMode=ask
defaultTimeoutMs=120000
approvalTimeoutMs=120000
```

The current STEP owns newly added execution-backend fields and their focused tests.

## Recurrence gate

Historical tests must not deep-equal an extensible current configuration object unless the object
is explicitly closed by contract. They must assert only the fields introduced and owned by that
historical STEP.
