# OR-ISSUE-202 — Current root documents omitted accepted-baseline checks and SHA

## First observed

STEP015B canonical package-candidate validation after the historical schema sweep.

## Symptom

The current README and related root documents named `STEP014_PRODUCT_CORE_ACCEPTED` but did not all
retain its exact accepted checks and immutable ZIP SHA-256. The canonical handoff-scope test failed
on `README.md`.

## Direct cause

The STEP015B documentation rewrite emphasized candidate versus Docker-live status but shortened the
accepted baseline identity to its step name. That weakened ZIP-only continuation evidence.

## Classification

```text
class=DOCUMENTATION_HANDOFF_EVIDENCE_OMISSION
product_runtime_defect=NO
source_package_blocking=YES
```

## Correction

`README.md`, `HANDOFF.md`, `PLANS.md`, `ROADMAP.md`, and `VALIDATION.md` all retain:

```text
STEP014_PRODUCT_CORE_ACCEPTED
WINDOWS_357/358_PRODUCT_CORE_ACCEPTED
484c231d4998d9dc58c298624671cf7a084348567ab2779c5a4bce6f04f05054
```

while separately identifying STEP015B as the current source/package candidate with Docker live
pending.

## Recurrence gate

The existing canonical handoff-scope test verifies every current root document against
`config/current-accepted-baseline.json`; STEP015B governance additionally requires OR-ISSUE-202 to
remain registered.
