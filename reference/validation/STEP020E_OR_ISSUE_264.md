# OR-ISSUE-264 — Delivery atomicity governance asserted an invented repository call

## First observation

STEP020E governance expected the literal call `taskDeliveries.insert` in `task-repository.ts`.

## Exact contradiction

The implemented atomicity deliberately inserts `task_completion_deliveries` with SQL inside the existing Task lifecycle transaction. Calling a separate repository method would not be evidence of sharing that exact transaction.

## Classification

Validation governance / implementation-token invention. The Product transaction and focused rollback tests were already passing.

## Correction

Governance now asserts the actual `INSERT INTO task_completion_deliveries` statement together with Task terminal synchronization in the same repository path.

## Recurrence gate

Atomicity governance must inspect the executable transaction boundary and actual persistence statement, not invent an abstraction name that the implementation does not use.
