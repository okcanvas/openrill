# STEP008 Synthetic Secret Fixture Literal

## Issue

`OR-ISSUE-019`

## Exact symptom

The first deterministic STEP008 ZIP was byte-identical across two builds and contained no credential files, but a direct ZIP byte scan found the synthetic live credential text in two source files:

```text
openrill/scripts/run-step008-live.mjs
openrill/scripts/run_step008_acceptance.py
```

The value was a non-production fixture, but the package documentation stated that Secret values were absent from the package. The literal therefore made the package claim false under a strict content scan.

## Code-confirmed root cause

`run-step008-live.mjs` assigned the fixture API key through a static string literal. `run_step008_acceptance.py` repeated the same literal to assert that it was absent from the acceptance report. The outer check therefore coupled itself to the secret value instead of requiring the live process to generate and validate its own credential.

## Impact

- A source ZIP carried a reusable credential-shaped value even though it was synthetic.
- Future contributors could copy the pattern for a real or semi-real token.
- Package cleanliness evidence and the documented point-of-use invariant were weaker than claimed.

## Fix

The live fixture now generates a fresh credential per execution:

```js
const secretValue = `fixture-${randomBytes(32).toString("hex")}`;
```

The same runtime value is used to verify the provider Authorization header and to scan SQLite bytes after Host shutdown. The outer acceptance no longer contains or depends on that value.

## Recurrence-prevention gate

`run_step008_acceptance.py` requires `randomBytes(32)` in the live fixture and rejects a static string assignment to `secretValue`. The live process remains responsible for the point-of-use and SQLite non-persistence assertions. Final package inspection also scans the ZIP for the previously leaked fixture literal and protected credential files.
