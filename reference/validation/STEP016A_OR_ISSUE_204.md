# OR-ISSUE-204 — Historical STEP015A governance froze the mutable accepted Product baseline

## First observed

STEP016A canonical validation after promoting the real Windows Docker STEP015B result into
`config/current-accepted-baseline.json`.

## Classification

Harness / historical-test ownership.

## Symptom

The retained STEP015A governance test required the mutable current accepted baseline to remain
`STEP014_PRODUCT_CORE_ACCEPTED`. STEP015B had already passed real Windows Docker acceptance 64/64
and was therefore the correct current Product baseline.

The immutable STEP015B H1 accepted ZIP preserves the pre-correction assertion:

```text
assert.equal(accepted.step, "STEP014_PRODUCT_CORE_ACCEPTED")
```

## Direct cause

A historical validation file owned a mutable current-baseline value instead of owning only the
STEP014 dimensional-closure evidence introduced by STEP015A.

## Correction

The historical STEP015A test now validates the retained STEP014 closure document and dimensional
shape without asserting the current baseline step. Current baseline identity is owned by the current
STEP governance and `config/current-accepted-baseline.json`.

## Recurrence prevention

- historical tests may retain immutable evidence from their own STEP;
- historical tests may not require the current accepted Product baseline to equal a past STEP;
- current candidate governance must prove the exact accepted baseline, checks marker, and ZIP SHA;
- canonical validation retains the corrected historical test on every later release.

## Product impact

None. This was a Harness ownership defect. STEP015B remains the accepted Product baseline.
