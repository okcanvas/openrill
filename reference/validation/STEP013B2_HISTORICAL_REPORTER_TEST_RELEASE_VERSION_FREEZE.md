# OR-ISSUE-102 — historical reporter test froze the current release version

## Exact symptom

After the repository identity advanced to `0.13.7-step013b2`, the retained STEP013B1A reporter suite failed one subtest although all Browser implementation and reporter behavior tests passed.

```text
Expected: 0.13.6-step013b1a
Actual:   0.13.7-step013b2
```

## Code-confirmed root cause

`focused-test-reporter-step013b1a.test.mjs` correctly verified that the historical STEP013B1A acceptance/package commands remained published, but also asserted that the mutable root `package.json.version` must forever equal the historical release version.

## Impact

Every valid later release would fail the canonical suite. This is the same ownership class as historical exact-current Tool inventory freezes: retained feature evidence was incorrectly coupled to a mutable current identity slot.

## Fix

The test verifies the historical `0.13.6-step013b1a` identity in the immutable STEP013B1A plan and continues to verify that its commands remain available. The mutable root version is owned by the current source-version alignment gate.

## Recurrence-prevention gates

- historical feature tests must not assert mutable root current version literals;
- immutable dedicated plans/reports retain historical identities;
- `verify_source_version_alignment.py` alone owns current manifest/source/Host version alignment;
- STEP013B2 boundary test scans the historical reporter test for the broken assertion.
