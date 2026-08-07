# OR-ISSUE-253 — Governance asserted a prose title token instead of the tested Flow contract

## First observation

The first STEP020D current-governance run looked for the literal text `cancellation-stuck` in the Flow maintenance test.

## Exact contradiction

The test title states `replays stuck cancellation`; `cancel-stuck` appears only in fixture data. The Product contract and test were correct, but the governance assertion depended on an invented title token.

## Classification

Validation governance semantic-token drift.

## Correction

Governance now asserts the actual test contract text and the concrete maintenance action/code elsewhere. No Product code or focused test behavior changed.

## Recurrence gate

Governance assertions reference executable symbols or exact existing contract text rather than paraphrased prose.
