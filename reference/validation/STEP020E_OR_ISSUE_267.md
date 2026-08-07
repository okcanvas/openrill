# OR-ISSUE-267 — Governance invented a separate pending-delivery Task event

## First observation

After correcting the delivery SQL assertion, STEP020E governance still expected a literal `task.delivery.pending` event in `task-repository.ts`.

## Exact contradiction

The Product contract appends the real terminal Task event and inserts a `PENDING` delivery row keyed by that terminal `task_event_sequence` in the same State transaction. It intentionally does not add a second synthetic pending Task event.

## Classification

Validation governance / event-model invention. Product atomicity and focused rollback behavior remained correct.

## Correction

Governance now asserts the terminal event sequence binding, the `task_completion_deliveries` insert, and the persisted `PENDING` delivery state.

## Recurrence gate

Governance must follow the implemented event model and may not require a second event when the durable delivery ledger itself owns pending status.
