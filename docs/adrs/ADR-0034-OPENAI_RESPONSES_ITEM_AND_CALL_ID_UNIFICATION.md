# ADR-0034 — Unify OpenAI Responses item and call identities

## Decision
Maintain one function-call accumulator and bind every observed `item_id`, item `id`, `call_id` and item `call_id` to it. `call_id` remains the public Tool-call identity. Empty names and identity conflicts fail inside the provider adapter.

## Rationale
`item_id` identifies a streamed output item while `call_id` identifies the function call used by later function-call output. Treating them as alternatives instead of aliases creates duplicate calls and can emit an empty canonical name.

## Consequences
- one provider function call produces exactly one OpenRill Tool call;
- canonical names never become empty or provider-shaped outside the adapter;
- malformed provider identity graphs fail before Tool Runtime dispatch.
