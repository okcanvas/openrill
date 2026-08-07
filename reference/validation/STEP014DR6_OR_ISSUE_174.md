# OR-ISSUE-174 — Stochastic nested Tool choice frozen into external-model acceptance

The Windows STEP014DR5 run completed the root and two direct children, but the model did not choose nested delegation. A probabilistic model choice was incorrectly treated as a runtime invariant. DR6 requires deterministic nested graph evidence separately.

## Recurrence gate

`tests/unit/step014dr6-acceptance-determinism.test.mjs` and `tests/unit/step014dr6-boundaries.test.mjs`.
