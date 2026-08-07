# OR-ISSUE-309 — Empty extension discovery notice consumed the bounded protocol replay window

```text
ISSUE=OR-ISSUE-309
FIRST_OBSERVED=STEP022A RETAINED LOCAL PROTOCOL REGRESSION
CLASSIFICATION=STEP022A EXTENSION / VALIDATION
PRODUCT_BASELINE=STEP021BR2_WINDOWS_LIVE_ACCEPTED
```

## Failure

Empty extension discovery notice consumed the bounded protocol replay window.

## Direct cause

The registry published extension.discovered even when no extensions existed, shifting the historical bounded notice sequence and causing a false resync requirement.

## Correction

The Host publishes extension.discovered only when at least one public record exists; the no-extension protocol fixture retains its original notice window.

## Recurrence gate

local-protocol-step004 and extension host regression.
