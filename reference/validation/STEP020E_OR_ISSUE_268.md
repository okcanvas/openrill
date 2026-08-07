# OR-ISSUE-268 — Retained STEP020A governance froze the terminal-set identifier casing

## First observation

The first full STEP020E governance run passed all Product and affected tests but failed one retained STEP020A source assertion.

## Exact contradiction

The Task repository still enforces terminal monotonicity with `TERMINAL.has(current.status)`. The historical assertion expected the obsolete lowercase identifier `terminal.has(current.status)`.

## Classification

Validation governance / retained source-symbol drift. No Task lifecycle behavior changed.

## Correction

The retained STEP020A governance now checks the actual terminal-set symbol while preserving the substantive monotonicity contract.

## Recurrence gate

Historical governance owns behaviorally meaningful source structure, not incidental identifier casing after later schema extensions.
