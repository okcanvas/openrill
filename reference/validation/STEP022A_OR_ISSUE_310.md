# OR-ISSUE-310 — Extension manifest mutability and unchecked runtime claims weakened the closed contract

```text
ISSUE=OR-ISSUE-310
FIRST_OBSERVED=STEP022A CODE REVIEW / EXTENSION BOUNDARY
CLASSIFICATION=STEP022A EXTENSION / VALIDATION
PRODUCT_BASELINE=STEP021BR2_WINDOWS_LIVE_ACCEPTED
```

## Failure

Extension manifest mutability and unchecked runtime claims weakened the closed contract.

## Direct cause

The first draft passed nested manifest objects by reference and trusted runtime capability objects after manifest validation.

## Correction

The Host structured-clones and deep-freezes the manifest, revalidates every claimed capability, rejects undeclared or duplicate claims, and requires every declared capability to be claimed.

## Recurrence gate

extension-runtime-step022a manifest freeze and malformed-claim fixtures.
