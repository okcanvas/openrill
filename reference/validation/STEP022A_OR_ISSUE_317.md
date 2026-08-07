# OR-ISSUE-317 — New spoofing regression called a nonexistent fixture helper

```text
ISSUE=OR-ISSUE-317
FIRST_OBSERVED=STEP022A FOCUSED TEST AUTHORING
CLASSIFICATION=STEP022A EXTENSION / VALIDATION
PRODUCT_BASELINE=STEP021BR2_WINDOWS_LIVE_ACCEPTED
```

## Failure

New spoofing regression called a nonexistent fixture helper.

## Direct cause

The first regression draft called writeExtension although the test file owns createExtension, causing a ReferenceError before exercising Product behavior.

## Correction

The fixture uses the existing createExtension helper and the focused test is required to fail before the Product fix and pass after it.

## Recurrence gate

extension-runtime-step022a spoofed-error fixture.
