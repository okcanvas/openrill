# OR-ISSUE-249 — Focused maintenance fixture used an invalid Run transition

## First observation

The initial Task projection test attempted to move a Run directly from `CREATED` to `COMPLETED`.

## Exact failure

The Conversation lifecycle correctly rejected the fixture because accepted Run transitions require `CREATED -> RUNNING -> COMPLETED`.

## Classification

Validation fixture error, not Product runtime failure.

## Correction

The fixture now follows the actual Run transition graph before intentionally corrupting only the Task projection. The test therefore proves maintenance repair without bypassing lifecycle invariants.

## Recurrence gate

The STEP020D focused test contains both explicit transition calls and remains in Product acceptance.
