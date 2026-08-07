# OR-ISSUE-222 — Historical Skill preparation test retained the old coordinator option

## First observation

STEP018B affected regression passed 18 tests and failed only `Skill preparation failure durably fails the Run before model execution`. The durable Run remained `CREATED` instead of becoming `FAILED`.

## Direct cause

STEP018B generalized the coordinator preparation boundary from `resolveSystemInstructions` to `resolveRunPreparation` so it can return both Skill instructions and the compact model Tool list. The historical JavaScript test continued to pass the removed property. JavaScript accepted the extra object key, so the intended throwing fixture was never invoked.

## Classification

```text
owner_dimension=HISTORICAL_HARNESS_API_ALIGNMENT
product_behavior_change=INTENTIONAL_PREPARATION_EXTENSION
state_schema_change=NONE
```

## Correction

The retained test now injects failure through `resolveRunPreparation` and continues to prove `SKILL_PREPARATION_FAILED` before model resolution.

## Recurrence prevention

Internal option renames that are not type-checked by JavaScript fixtures require an affected regression that proves the injected callback actually executes.
