# OR-ISSUE-208 — Historical governance retained mutable accepted-baseline ownership

## First observed
STEP016B governance preflight after STEP016AR1 Windows promotion.

## Classification
Harness / governance recurrence. No Product runtime impact.

## Symptom
Retained STEP015B and STEP016A governance tests rejected the valid current accepted baseline because they still required their historical baseline to remain current.

## Direct cause
Earlier ownership corrections covered STEP014/STEP015A cases but did not sweep all later governance tests for exact assertions against `config/current-accepted-baseline.json.step`, checks, and SHA.

## Correction
Historical tests now prove their immutable evidence documents and generic dimensional-baseline validity. Exact current baseline identity is owned only by current STEP governance. OR-ISSUE-202 root-document checks remain dynamic from the current baseline file.

## Prevention
STEP016B governance scans the full unit tree for executable exact current-baseline assertions in historical tests. A later accepted-baseline promotion must not require editing historical feature evidence.


## STEP016C recurrence interception
Before STEP016C canonical execution, the retained STEP016B governance test was found to still require the STEP016AR1 baseline exactly. This was the same ownership class, not a new issue. The historical test now proves the immutable STEP016B Windows acceptance document while current STEP016C governance exclusively owns the mutable accepted-baseline identity.
