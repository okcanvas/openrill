# OR-ISSUE-084 — STEP013AR1 historical feature/current release version assertion drift

## Exact symptom

The first STEP013AR1 aggregate run failed the eighth Browser boundary test although the source-version verifier passed:

```text
expected version=0.13.0-step013a
actual   version=0.13.1-step013ar1
```

## Root cause

`browser-runtime-boundaries-step013a.test.mjs` correctly retained the STEP013A feature contracts but incorrectly hardcoded STEP013A's original release version as the current package identity. A corrective release changed current identity without changing the retained feature.

## Impact

Every corrective release after STEP013A would be rejected even when all manifests, source indexes, and Host literals were internally exact.

## Fix

Read the current root package version and assert the dedicated source-version verifier reports that value. Retained STEP013A feature assertions remain fixed independently.

## Recurrence gate

The boundary test derives current release identity from `package.json`; no original STEP013A version literal remains in current-identity assertions.
