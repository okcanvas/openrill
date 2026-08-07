# OR-ISSUE-313 — Repeated configured startup could reactivate an already ready Extension

```text
ISSUE=OR-ISSUE-313
FIRST_OBSERVED=STEP022A CODE REVIEW / HOST RESTART SEMANTICS
CLASSIFICATION=STEP022A EXTENSION / VALIDATION
PRODUCT_BASELINE=STEP021BR2_WINDOWS_LIVE_ACCEPTED
```

## Failure

Repeated configured startup could reactivate an already ready Extension.

## Direct cause

startConfigured did not explicitly restrict activation to DISCOVERED records, allowing duplicate lifecycle ownership in a repeated startup call.

## Correction

Only enabled DISCOVERED records activate; READY and FAILED records are stable until explicit lifecycle action, and repeat startConfigured is idempotent.

## Recurrence gate

extension-runtime-step022a deterministic activation fixture.
