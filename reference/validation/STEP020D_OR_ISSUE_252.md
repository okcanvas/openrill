# OR-ISSUE-252 — Current governance assumed SQL layout and the wrong migration filename

## First observation

The first STEP020D current-governance run failed while Product build and focused maintenance tests were green.

## Exact failures

- The assertion expected `ALTER TABLE ... ADD COLUMN` on one physical line, while migration 021 intentionally formats the clauses on separate lines.
- The assertion opened `018_durable_background_tasks.sql`, but the actual accepted file is `018_durable_background_task_ledger.sql`.

## Classification

Validation governance path/format brittleness.

## Correction

Governance matches SQL semantically across whitespace and reads the actual repository filename. The production migration was not changed.

## Recurrence gate

Current governance uses whitespace-tolerant schema patterns and code-derived paths. A validation typo is not reported as a Product schema failure.
