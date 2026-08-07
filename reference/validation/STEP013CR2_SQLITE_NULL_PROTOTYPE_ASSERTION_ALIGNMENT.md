# STEP013CR2 SQLite Null-Prototype Assertion Alignment

## Issue

`OR-ISSUE-118` records a Windows-only false negative in the STEP013CR1 live fixture. `node:sqlite` returned `[Object: null prototype]` for a query row. `assert.deepEqual(row, objectLiteral)` compared object prototypes even though `status` and `errorCode` exactly matched.

## Correction

The live fixture now delegates to `scripts/recovery-live-assertions.mjs` and validates durable row fields independently:

```text
status == FAILED
errorCode == MODEL_INTERRUPTED_BY_RESTART
```

The helper first requires an object row, then checks only the owned values. It does not clone, stringify, or normalize raw database content, and it does not weaken either expected value.

## Recurrence protection

- a behavioral unit fixture constructs `Object.create(null)` with the two expected fields and requires acceptance;
- missing, wrong status, and wrong error code remain failures;
- a source gate rejects `deepEqual(invocation, ...)` and `deepStrictEqual(invocation, ...)` in the current live fixture;
- the real STEP013CR1 Windows failure is retained verbatim enough to preserve the prototype distinction.
