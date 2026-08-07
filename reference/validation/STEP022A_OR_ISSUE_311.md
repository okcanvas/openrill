# OR-ISSUE-311 — Extension import and lifecycle calls were unbounded and raw failures could escape

```text
ISSUE=OR-ISSUE-311
FIRST_OBSERVED=STEP022A CODE REVIEW / HOST AVAILABILITY
CLASSIFICATION=STEP022A EXTENSION / VALIDATION
PRODUCT_BASELINE=STEP021BR2_WINDOWS_LIVE_ACCEPTED
```

## Failure

Extension import and lifecycle calls were unbounded and raw failures could escape.

## Direct cause

Import, activation, and deactivation could wait indefinitely, and direct extension exceptions risked exposing implementation details.

## Correction

Import/activation and deactivation have bounded phase timeouts; arbitrary extension exceptions are projected to generic public diagnostics while internal contract failures remain specific.

## Recurrence gate

extension-runtime-step022a timeout and failure-isolation fixtures.
