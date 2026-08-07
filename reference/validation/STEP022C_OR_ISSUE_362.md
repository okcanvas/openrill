# OR-ISSUE-362 — Current Local Protocol capability fixture omitted STEP022C observability operations

## Observed problem

The core authenticated WebSocket test owns the current exact protocol capability list. STEP022C added `connector.status` and `connector.doctor`, but the fixture still expected the STEP022B list.

## Correction

The exact current capability fixture now includes both closed read-only observability operations in sorted order.

## Recurrence gate

Every STEP that changes the current public Local Protocol updates the single exact current capability fixture; historical tests only assert retained capabilities.
