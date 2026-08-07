# ADR-0037 — Provider-Neutral Execution Backend and Explicit Host Fallback

## Status

Accepted in STEP015A.

## Context

The existing process Tool executes directly on the Host. STEP015 requires Docker confinement
without allowing callers or future Tools to depend directly on Docker command syntax.

## Decision

`@openrill/sandbox` owns the provider-neutral execution backend contract, workspace authority,
confinement proof, deny-by-default mount/network policy, and Host backend.

`@openrill/sandbox-docker` owns Docker CLI lifecycle and secure command planning.

Host fallback is never implicit. `HOST` never reports `sandboxed=true`. Docker images must be
pinned by SHA-256 digest. Extra host binds and Docker socket mounts are denied.

## Consequences

Process Tool integration can select an execution backend in a later STEP without widening
workspace authority or confusing Host policy enforcement with container isolation.
