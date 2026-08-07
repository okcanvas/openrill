# OR-ISSUE-195 — Historical STEP014DR2 test froze the current release minor line

## Evidence

After OR-ISSUE-194 was corrected, the STEP015A canonical suite reached
`tests/unit/step014dr2-boundaries.test.mjs` and failed:

```text
The input did not match the regular expression /^0\.14\./.
Input: '0.15.0-step015a'
```

The test description stated that it retained STEP014DR2 entrypoints without freezing later
current identity, but its implementation still required every future root release to remain on
minor line `0.14`.

## Classification

`HARNESS / HISTORICAL_CURRENT_VERSION_LINE_FREEZE`

## Prior class

This is the same ownership class as OR-ISSUE-084, OR-ISSUE-186, and related historical
current-version freezes. The previous prevention mechanism removed exact corrective versions but
did not prohibit a historical test from freezing the current major/minor line.

## Correction

The retained STEP014DR2 test now:

- proves immutable DR2 plan identity and entrypoints;
- proves the current version is not the historical DR2 release;
- validates only generic version syntax for the mutable root identity.

## Product impact

None. The Sandbox implementation and focused tests had already passed. The failure was in a
historical canonical boundary test.
