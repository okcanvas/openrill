# OR-ISSUE-314 — Windows-accepted STEP021BR2 baseline was not propagated to root handoff documents

```text
ISSUE=OR-ISSUE-314
FIRST_OBSERVED=STEP022A CUMULATIVE GOVERNANCE RUN
CLASSIFICATION=STEP022A EXTENSION / VALIDATION
PRODUCT_BASELINE=STEP021BR2_WINDOWS_LIVE_ACCEPTED
```

## Failure

Windows-accepted STEP021BR2 baseline was not propagated to root handoff documents.

## Direct cause

config/current-accepted-baseline.json was promoted after the real 82/82 Windows run, but root handoff documents still declared STEP021A and 58/58.

## Correction

Every root continuation document now carries the exact STEP021BR2 step, version, 82/82 checks, artifact SHA, and current STEP022A pending identity.

## Recurrence gate

dynamic baseline-document coherence governance.
