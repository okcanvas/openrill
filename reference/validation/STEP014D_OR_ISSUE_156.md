# OR-ISSUE-156 — Acceptance predicates guessed implementation wording

## Symptom and code-confirmed cause

The first STEP014D aggregate marked the closed list validator and UI relation tree as failed although focused runtime/source tests passed. The runner searched for error text that differed from the implemented message and for an equality expression although the UI correctly used a parent-index map.

## Correction

The validator predicate checks the exact owned conflict message plus `boundedInteger(value.limit, 1, 200)`. The tree predicate checks parent indexing, root detection and child traversal tokens actually owning the invariant.

## Recurrence gate

STEP014D boundary tests exercise validator behavior and tree source. The aggregate no longer invents equivalent syntax.
