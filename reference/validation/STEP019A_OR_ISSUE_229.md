# OR-ISSUE-229 — Windows live schema check inspected the State barrel instead of the schema owner

## First evidence

The first real Windows STEP019A live run passed every source/package stage, canonical `646/646`, all four focused Product tests, and cleanup. The child ended `9/10 FAILED` only at `OPENRILL_STEP019A_LIVE_FAILURE check=schema detail=`.

## Direct cause

`run-step019a-goal-live.mjs` read `packages/state/src/index.ts` and searched for the literal definition `OPENRILL_STATE_SCHEMA_VERSION = 17`. The State barrel only re-exports that symbol; its authoritative definition is owned by the State migration module and its built runtime export. The empty failure detail also hid the observed value.

## Correction

Harness H1 imports `OPENRILL_STATE_SCHEMA_VERSION` from the built `packages/state/dist/index.js`, compares the actual runtime value with schema 17, and records the observed value in failure detail.

```text
harness=STEP019A_H1_STATE_SCHEMA_SOURCE_OF_TRUTH_ALIGNMENT
product_version=0.19.0-step019a
state_schema=17
product_change=NONE
```

No Product corrective STEP or schema increment is created.
