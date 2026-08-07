# OR-ISSUE-337 — Historical STEP020ER1/ER2 governance froze schema 24

STEP020ER1 and STEP020ER2 own the migration-022 completion-delivery contract. Their governance tests incorrectly required the global current schema source to remain 24. STEP022B legitimately advances it to 25.

The gates now parse the current schema and require it to be at least 22 while still checking the exact migration 022 and completion-delivery behavior.
