# OR-ISSUE-178 — Browser wait timeout could skip the first predicate attempt

## Symptom

Under a loaded serial canonical run, the historical browser-evidence test used a one-millisecond timeout and the event loop reached the deadline before the first predicate evaluation. The helper then read page state from the wrong queued response and lost the expected diagnostic text.

## Root cause

`waitForBrowserCondition` used `while (Date.now() < deadline)` and therefore allowed zero predicate attempts.

## Correction

The wait loop now guarantees exactly one initial predicate attempt, then continues only while the deadline remains.

## Recurrence gate

A one-millisecond timeout still performs the predicate once and the subsequent page-state diagnostic once; the first-page diagnostic block remains stable under scheduler delay.
