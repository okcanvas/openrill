# STEP014DR3 — OpenAI Responses Stream Tool Identity Unification and Empty-Name Fail-Closed

## Identity
- version: `0.14.6-step014dr3`
- schema: 14 unchanged
- accepted baseline: STEP013CR2
- retained product: STEP014D + STEP014DR1 + STEP014DR2

## Windows evidence
STEP014DR2 reached the provider successfully. Request 1 completed with 1,149 input tokens, 111 output tokens and four streamed Tool-call events. Two Tool calls completed, then a third `tool.started` failed as `AGENT_TOOL_FAILED`. The hidden failure message was exactly identified from its length and SHA-256 as `tool not found: `, proving that an empty Tool name left the adapter.

## Code-confirmed cause
OpenAI Responses uses two identities for one streamed function call:
- item identity: `item.id` / event `item_id`;
- callable identity: `item.call_id` / event `call_id`.

The STEP014DR2 adapter keyed `response.output_item.added` by `call_id`, but keyed argument delta/done events by `item_id` when `call_id` was absent. One provider call therefore produced two accumulators. The real accumulator emitted a canonical Tool call; the orphan item accumulator emitted a second call with an empty name during `response.completed`.

## Correction
- bind `item_id` and `call_id` to one accumulator;
- detect conflicting identity bindings and fail `MODEL_STREAM_INVALID`;
- require a non-empty canonical Tool name before any `tool_call` event leaves the adapter;
- preserve deterministic provider alias ↔ canonical Tool round trip;
- expose only privacy-safe recent Tool event identity in failure diagnostics.

## Exclusions
No schema, Protocol, UI, delegation graph, budget, Browser, Tool Registry or canonical Tool-name change.
