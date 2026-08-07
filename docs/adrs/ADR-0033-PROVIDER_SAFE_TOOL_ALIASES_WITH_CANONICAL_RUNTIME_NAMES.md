# ADR-0033 — Provider-safe Tool aliases with canonical runtime names

## Decision

OpenRill canonical Tool names remain namespaced and human-readable (`agent.spawn`, `workspace.read`). A provider adapter may project them to a provider-specific alias when the provider grammar is narrower. Aliasing is adapter-local, deterministic, collision-checked and reversible.

## Rationale

Renaming the public Tool Registry to provider-compatible names would leak one provider's grammar into permissions, ledgers, tests and other adapters. Passing dotted names unchanged makes OpenAI requests invalid. Adapter-local aliases preserve both boundaries.

## Invariants

- canonical names own authorization, durable events and dispatch;
- provider aliases contain only `[A-Za-z0-9_-]` and are at most 64 characters;
- aliases do not depend on Tool order or neighboring Tools;
- historical function-call input and current definitions use the same alias;
- streamed calls are translated back before leaving the adapter;
- unknown aliases fail closed.
