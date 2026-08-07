# OR-ISSUE-318 — Historical STEP021BR2 evidence assertion used the wrong field capitalization

```text
ISSUE=OR-ISSUE-318
FIRST_OBSERVED=STEP022A CUMULATIVE GOVERNANCE
CLASSIFICATION=VALIDATION GOVERNANCE / EVIDENCE TOKEN DRIFT
PRODUCT_IMPACT=NONE
```

## Failure

Cumulative governance reached 219/220 but the retained STEP021BR2 acceptance test searched for lowercase `checks=82/82` while the immutable evidence records uppercase `CHECKS=82/82`.

## Direct cause

The historical ownership correction rewrote the assertion from mutable baseline state to immutable evidence but invented token capitalization instead of reading the actual evidence format.

## Correction

Assert the exact immutable `CHECKS=82/82` and `WINDOWS_TAP_SUMMARY_LIVE=PASSED` evidence tokens.

## Recurrence gate

The full cumulative governance suite must pass, and current STEP governance must never normalize or invent immutable evidence tokens.
