# ADR-0038 — Ephemeral Host First Conversation and Loopback Promotion

## Status
Accepted for STEP016B.

## Decision
`openrill ask` reads one prompt from stdin, starts the real local Host on an ephemeral port, creates a durable Conversation and Run through the configured model resolver, prints only the bounded assistant result, and closes the Host before returning.

The Windows promotion fixture uses the real DPAPI CurrentUser provider and the real OpenAI Responses adapter against a bounded loopback SSE server. It does not call a paid or external model and does not use a browser.

## Rationale
The Product claim is first usable local Conversation flow, not provider quality. Loopback transport proves secret resolution, Authorization, request shape, streaming, durable state and lifecycle deterministically without cost or external variability.

## Consequences
- Prompt text is stdin-only and never accepted on argv.
- API-key bytes remain off argv and environment.
- One-shot `ask` requires the profile Host lock to be free.
- Long-running Host client attachment and interactive multi-turn CLI remain later work.
- Connector/Mattermost work remains deferred until a real system contract exists.
