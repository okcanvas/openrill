# OR-ISSUE-171 — Historical diagnostics exact-object freeze

## Symptom
The retained STEP014DR1 diagnostic test rejected the new privacy-safe `errorCode:null` metadata even though every original field was preserved.

## Cause
The historical test used exact object equality for an additive diagnostic projection.

## Correction
The retained test now includes the additive field while continuing to verify that Tool arguments and private provider text are absent. Historical behavior remains preserved; current diagnostic ownership belongs to STEP014DR4.

## Gate
Typed Tool error metadata may be added only as bounded scalar fields; raw arguments/results/messages remain forbidden.
