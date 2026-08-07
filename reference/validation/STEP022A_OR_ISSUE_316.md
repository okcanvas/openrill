# OR-ISSUE-316 — Extension could spoof MODULE_INVALID to expose an arbitrary diagnostic

```text
ISSUE=OR-ISSUE-316
FIRST_OBSERVED=STEP022A CODE REVIEW / ERROR CLASSIFICATION
CLASSIFICATION=STEP022A EXTENSION / VALIDATION
PRODUCT_BASELINE=STEP021BR2_WINDOWS_LIVE_ACCEPTED
```

## Failure

Extension could spoof MODULE_INVALID to expose an arbitrary diagnostic.

## Direct cause

The Host classified any thrown object with code MODULE_INVALID as an internal contract failure and surfaced its message.

## Correction

Only a private ExtensionModuleContractError instance is treated as an internal contract failure; a forged code string is projected as generic ACTIVATION_FAILED.

## Recurrence gate

extension-runtime-step022a spoofed-error fixture.
