# OR-ISSUE-256 — Exact Local Protocol capability contract omitted maintenance operations

## First observation

The first STEP020D affected regression failed in `local-protocol-step004.test.mjs` while all focused maintenance tests passed.

## Exact failure

The production operation registry advertised six new operations, but the retained authenticated WebSocket handshake expected the pre-STEP020D exact sorted list:

```text
task.audit
task.reconcile
task.retention.preview
taskFlow.audit
taskFlow.reconcile
taskFlow.retention.preview
```

were absent from the expected list.

## Classification

Product public protocol acceptance / retained integration contract.

## Correction

The exact sorted authenticated capability list now includes all six maintenance operations. Focused behavior and broad handshake advertisement are both required.

## Recurrence gate

Every new public operation must update the exact Local Protocol capability contract in the same STEP. Registering an operation is not sufficient acceptance evidence by itself.
