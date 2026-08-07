# STEP014DR6_EXTERNAL_MODEL_ACCEPTANCE_DETERMINISM_AND_NESTED_UI_EVIDENCE_SEPARATION

- version: `0.14.9-step014dr6`
- schema: `14`
- baseline: `STEP013CR2`
- retained feature: `STEP014D`

## Purpose

Separate stochastic external-model behavior from deterministic nested runtime/UI evidence.

## Acceptance ownership

1. `external-model-parallel-live`: actual OpenAI Responses, two direct children, durable waits, parent resume.
2. `deterministic-nested-control-ui-live`: deterministic depth-2 SQLite graph, actual Host/Protocol/Chromium tree and detail rendering.

No schema, Protocol, Agent Tool, delegation runtime, or Control UI product surface is added.
