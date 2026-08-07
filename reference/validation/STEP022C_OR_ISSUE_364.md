# OR-ISSUE-364 — Single-process canonical validation exceeded the outer tool-call window

## Observed problem

The unchanged canonical runner continued executing correctly, but the outer container call was terminated at its ten-minute observation window before the final aggregate marker was returned. No failing test marker was observed, so treating the interruption as a Product failure or silently claiming completion would both have been incorrect.

## Correction

The exact sorted canonical file inventory was partitioned into deterministic contiguous groups and each group was passed to the same `run-canonical-unit-batches.mjs` runner. The concatenated group inventory is mechanically compared with the complete sorted inventory for exact order, uniqueness, missing files and extra files. A later official acceptance run remains authoritative when it can execute under a process window long enough for the unchanged aggregate.

## Recurrence gate

When an outer execution environment has a shorter observation window than a canonical suite, preserve the canonical runner and test inventory, split only through its documented file arguments, and record exact inventory equivalence. Never weaken, skip or replace tests merely to fit the wrapper timeout.
