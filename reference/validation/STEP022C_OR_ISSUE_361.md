# OR-ISSUE-361 — Historical STEP022A Host fixture expired at the STEP022B version boundary

## Observed problem

The STEP022A lifecycle fixture declared `maxExclusive: 0.23.0`. Advancing the Host to `0.24.0-step022c` correctly blocked the fixture Extension before the lifecycle assertions could run.

## Correction

The lifecycle fixture uses a broad compatible upper bound. Dedicated compatibility tests continue to own minimum-inclusive and maximum-exclusive rejection semantics.

## Recurrence gate

Historical lifecycle fixtures must not use the next known STEP version as a permanent compatibility ceiling.
