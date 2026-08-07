# @openrill/model-openai-responses

Narrow OpenAI-compatible Responses API adapter. It uses built-in `fetch`, accepts a resolved API key only at creation time, and emits only `@openrill/model-adapter` events.

Canonical OpenRill Tool names may contain namespace dots. Before an OpenAI Responses request, this adapter projects provider-safe deterministic aliases matching `[A-Za-z0-9_-]{1,64}`. It applies the same alias to definitions and historical function calls, then restores streamed aliases to canonical names before Kernel dispatch. Provider aliases never replace canonical Tool Registry identities.
