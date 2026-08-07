# OR-ISSUE-113 — Current root documents omitted accepted check identity

## Symptom

The STEP013C canonical suite reached 320 tests and failed only the dynamic current-baseline document gate for `README.md`. The current candidate STEP and accepted STEP/SHA were present, but the exact accepted check identity `134/134` was absent from `README.md` and `PLANS.md`.

## Code-confirmed cause

The root-document rewrite copied only `step` and `zipSha256` from `config/current-accepted-baseline.json`. The existing canonical gate intentionally requires all mutable baseline identity fields—step, checks, and ZIP SHA—in each root continuation document.

## Impact

A ZIP reader could identify the accepted artifact but could not independently distinguish the exact accepted aggregate result from a partial or failed run.

## Correction

`README.md` and `PLANS.md` now include `134/134`. `HANDOFF.md`, `ROADMAP.md`, and `VALIDATION.md` already retained it. The STEP013C acceptance runner now validates the accepted checks value in every root document and retains this issue in the registry and recurrence gates.

## Permanent gate

`historical-acceptance-baseline-scope-step012br1.test.mjs` loads `config/current-accepted-baseline.json` dynamically and requires every mutable root document to contain current candidate identity plus accepted step, checks, and SHA. No current accepted literal is embedded in the test.
