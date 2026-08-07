# OR-ISSUE-162 — Request-local Tool aliases could drift across turns or collide with valid names

## Risk found during correction

Replacing `.` with `_` only for the current request is not a durable mapping. `agent.spawn` can collide with a canonical `agent_spawn`, and the selected alias could change when the available Tool set changes between requests. A historical function-call item would then be replayed with a different name.

## Correction

Provider aliases are deterministic from the canonical name itself. Provider-valid canonical names remain unchanged. Provider-invalid names always receive a canonical SHA-256-derived alias independent of request order or neighboring Tools. The same map projects Tool definitions and historical function-call items and reverses streamed provider calls. Unknown provider aliases fail closed as `MODEL_STREAM_INVALID`.

## Recurrence gate

The collision fixture includes both `agent.spawn` and `agent_spawn`, verifies unique provider-valid names, verifies historical function calls reuse the same alias, and verifies an unknown streamed alias is rejected rather than dispatched.
