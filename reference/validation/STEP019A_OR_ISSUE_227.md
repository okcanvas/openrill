# OR-ISSUE-227 — History-aware fixture selected the wrong Tool result

```text
owner_dimension=HARNESS_EVIDENCE_SELECTION
product_runtime_change=NONE
product_version_change=NONE
state_schema_change=NONE
```

## Observation

The Host restart test initially inspected the first generic `role=tool` message and treated it as the current `goal.get` response.

## Direct cause

A continued Conversation contains durable historical Tool messages. Positional or role-only selection can choose an earlier `goal.create` result.

## Correction

The fixture selects the Tool result by exact Tool identity (`name=goal.get`) and, where available, Tool call identity. Historical messages remain intact.

## Classification

Harness temporal-evidence selection defect. No Product change was required.
