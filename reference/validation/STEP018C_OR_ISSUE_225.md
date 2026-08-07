# OR-ISSUE-225 — Approval benchmark fixture omitted authoritative Workspace provenance

## Observation

The first STEP018C approval-denial scenario failed with a State foreign-key violation before durable approval could be evaluated.

## Direct cause

The fixture constructed `ConversationService` with a permitted Workspace identifier but did not create the corresponding authoritative Workspace row. `ApprovalService` correctly attempted to persist a Tool call and approval request against Product provenance; SQLite rejected the nonexistent Workspace reference.

## Classification

```text
owner=BENCHMARK_FIXTURE
product_behavior=FAIL_CLOSED_CORRECT
state_schema_change=NONE
```

## Correction

The fixture creates a temporary physical Workspace, resolves it through `createWorkspaceCatalog`, and upserts the exact descriptor into State before starting the Agent Run.

## Prevention

- Approval benchmark fixtures use actual Product Workspace SOT records.
- A successful denial scenario proves `WAITING_APPROVAL`, one durable request, explicit `DENIED`, zero sensitive Tool executions and no extra model call.
- Synthetic nonexistent Workspace provenance remains valid only in an explicit fail-closed test.
