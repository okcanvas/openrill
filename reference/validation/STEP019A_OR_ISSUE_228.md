# OR-ISSUE-228 — Historical Memory test froze the mutable current State schema

```text
owner_dimension=HISTORICAL_HARNESS
product_runtime_change=NONE
product_version_change=NONE
state_schema_change=NONE
```

## Observation

STEP019A canonical stopped in the accepted STEP018A Memory test with `17 !== 16`; every actual Memory operation, FTS search, restart and provenance assertion passed.

## Direct cause

The historical capability test asserted that the global mutable `OPENRILL_STATE_SCHEMA_VERSION` must remain exactly 16. A later additive migration correctly advanced it to 17.

## Correction

The test now requires the runtime schema to be at least the STEP018A introduction schema and requires the opened database schema to equal the current runtime schema. STEP018A Memory behavior remains fully asserted.

## Classification

Historical Harness ownership defect. No Product change was required.
