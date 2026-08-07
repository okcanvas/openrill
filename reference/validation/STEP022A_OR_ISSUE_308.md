# OR-ISSUE-308 — Optional env was passed as explicit undefined under exact optional types

```text
ISSUE=OR-ISSUE-308
FIRST_OBSERVED=STEP022A WORKSPACE BUILD / TYPESCRIPT
CLASSIFICATION=STEP022A EXTENSION / VALIDATION
PRODUCT_BASELINE=STEP021BR2_WINDOWS_LIVE_ACCEPTED
```

## Failure

Optional env was passed as explicit undefined under exact optional types.

## Direct cause

The Host constructed an options object with env: undefined instead of omitting the optional property, violating exactOptionalPropertyTypes.

## Correction

Conditional object spread omits env and other optional fields when absent; workspace build is mandatory before focused tests.

## Recurrence gate

workspace build plus STEP022A governance source assertion.
