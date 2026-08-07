# OR-ISSUE-307 — Invalid discovery synthesized a fake capability and exposed filesystem detail

```text
ISSUE=OR-ISSUE-307
FIRST_OBSERVED=STEP022A CODE REVIEW / DISCOVERY DIAGNOSTICS
CLASSIFICATION=STEP022A EXTENSION / VALIDATION
PRODUCT_BASELINE=STEP021BR2_WINDOWS_LIVE_ACCEPTED
```

## Failure

Invalid discovery synthesized a fake capability and exposed filesystem detail.

## Direct cause

The first draft represented an invalid root with a fabricated tool capability and reused low-level filesystem errors in public diagnostics.

## Correction

Invalid records now have zero capabilities, use a stable synthetic id, and expose bounded stage-specific messages without absolute paths.

## Recurrence gate

extension-runtime-step022a invalid-root fixture and STEP022A governance.
