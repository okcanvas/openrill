# OR-ISSUE-315 — Historical governance tests re-owned the mutable current baseline

```text
ISSUE=OR-ISSUE-315
FIRST_OBSERVED=STEP022A CUMULATIVE GOVERNANCE RUN
CLASSIFICATION=STEP022A EXTENSION / VALIDATION
PRODUCT_BASELINE=STEP021BR2_WINDOWS_LIVE_ACCEPTED
```

## Failure

Historical governance tests re-owned the mutable current baseline.

## Direct cause

Retained STEP020ER1 through STEP021BR2 tests asserted that the mutable current baseline must forever remain STEP021A.

## Correction

Historical tests now assert only their immutable evidence and structural validity; exact current baseline ownership belongs exclusively to the current STEP022A governance.

## Recurrence gate

all validation-governance tests plus STEP022A exact baseline owner.
