# STEP008 Reference Evidence Whitespace Normalization

## Issue

`OR-ISSUE-016`

## Exact symptom

After adding five valid STEP008 OpenClaw evidence records, source verification reported:

```text
REFERENCE_EVIDENCE_VERIFICATION verified=115/118 state=FAILED
```

The three failed records were `OC-MODEL-003`, `OC-MODEL-004`, and `OC-MODEL-005`. Their line numbers and needles matched, but `lineMatches=false` because the expected excerpt retained indentation while the verifier stripped indentation from the actual source line.

## Code-confirmed root cause

`verify_reference_against_source.py` performed:

```text
actual_excerpt = raw.strip()
line_matches = actual_excerpt == item["excerpt"]
```

Only one side of the comparison was normalized.

## Impact

- Correct reference evidence could fail after an unrelated STEP.
- The verifier mixed exact-line semantics with indentation-insensitive semantics.
- A previously generated report could hide the defect until evidence was revalidated from the external source.

## Fix

Both sides now use the same normalization:

```text
actual_excerpt = raw.strip()
expected_excerpt = str(item["excerpt"]).strip()
line_matches = actual_excerpt == expected_excerpt
```

The external OpenClaw source then verifies `118/118`.

## Recurrence-prevention gate

STEP008 acceptance checks the symmetric normalization code and requires the current external verification report to be `118/118` with `allVerified=true`.
