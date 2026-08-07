# OR-ISSUE-335 — Historical STEP021B Product tests reclaimed schema 24

STEP022B correctly advances the global State schema to 25. Two retained STEP021B tests still asserted that the current global schema must equal 24, although their actual ownership is the immutable Plan-revision behavior introduced by migration 024.

The tests now require a schema at least 24 and continue to exercise the exact revision snapshot, blocker and retry columns. Current schema ownership belongs to STEP022B governance.
