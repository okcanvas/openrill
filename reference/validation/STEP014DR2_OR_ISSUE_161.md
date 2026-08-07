# OR-ISSUE-161 — Canonical dotted Tool names violated the OpenAI function-name grammar

## Actual Windows symptom

STEP014DR1 preserved the first external-model failure as `MODEL_INVALID_REQUEST` on request 1, turn 1, before any delegation row existed. The configured model was `gpt-4.1`; authentication and transport had already succeeded far enough to receive an HTTP invalid-request classification.

## Code-confirmed cause

OpenRill canonical Tool names are intentionally namespaced with dots, for example `agent.spawn`, `agent.wait`, `workspace.read`, and `browser.open`. `packages/model-openai-responses/src/index.ts` projected `tool.name` directly into the OpenAI Responses function `name` field. That provider field accepts only ASCII letters, digits, underscore and dash, with a maximum length of 64. Every dotted Tool therefore made the first request structurally invalid.

## Correction

The OpenAI adapter now creates provider-safe aliases while retaining canonical OpenRill names in the Tool Registry, durable events, permission checks and dispatch. Invalid canonical names receive a deterministic readable prefix plus a 16-hex SHA-256 suffix. The description records the canonical name for model selection.

## Recurrence gate

A captured HTTP request proves dotted names never cross the provider boundary, every projected name matches `^[A-Za-z0-9_-]{1,64}$`, and an emitted provider function call is restored to canonical `agent.spawn` before Kernel dispatch.
