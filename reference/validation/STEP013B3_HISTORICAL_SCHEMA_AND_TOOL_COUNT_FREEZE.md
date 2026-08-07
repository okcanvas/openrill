# OR-ISSUE-105 — historical schema and Browser Tool count freeze

## Exact symptom

After adding STEP013B3 migration 010 and three Browser Tools, retained STEP013A/B1/B2 tests failed even though every capability owned by those STEPs remained present and unchanged.

## Code-confirmed root cause

Historical tests asserted the mutable current repository identity instead of their own retained contract. They required schema exactly 9, required migration 010 to remain absent, or compared the complete current Browser Tool list to the historical six- or twelve-item inventory.

## Impact

A valid additive schema migration and Tool extension was classified as a regression. Repeating the pattern would make every later Browser STEP rewrite older tests and obscure which STEP owns the current exact inventory.

## Fix

Historical gates now assert their minimum supported schema and retained Tool prefix/subset. STEP013B3 alone owns schema 10, migration 010, and the exact 15-tool inventory. Historical accepted markers and immutable evidence remain unchanged.

## Recurrence-prevention gates

- `browser-artifact-boundaries-step013b3.test.mjs` scans the retained B1/B2 boundary gates;
- historical tests may assert `currentSchema >= ownedSchema` but not current equality;
- exact current Tool count and schema are asserted only by STEP013B3 acceptance and focused tests.
