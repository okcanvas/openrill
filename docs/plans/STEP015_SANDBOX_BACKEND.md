# STEP015 — SANDBOX_BACKEND

## Purpose

Add an execution backend abstraction and Docker confinement without silently widening workspace,
network, mount, or fallback authority.

## Split

### STEP015A — completed contract and confinement-plan foundation

- `@openrill/sandbox` provider-neutral contract;
- workspace authority and confinement proof;
- actual Host backend with `sandboxed=false`;
- `@openrill/sandbox-docker` Docker CLI lifecycle and hardened command planning;
- injected deterministic tests;
- no browser and no live Docker claim.

### STEP015B — current Process Tool integration and live Docker confinement

- backend selection in `process.run`;
- explicit policy/config contract;
- backend and confinement proof in Tool result/durable process metadata;
- real Docker create/exec;
- read-only write denial and read-write success;
- network none and explicit outbound;
- timeout, cancel, cleanup, stale prune;
- explicit Host fallback only.

### STEP015C — conditional recovery wave

Create only when STEP015B code/live evidence proves label-scoped prune and existing process state
are insufficient for crash/restart ownership. Do not pre-create work from speculation.

## Non-goals

- Kubernetes or remote sandbox;
- Docker socket access;
- arbitrary host bind mounts;
- browser-based sandbox acceptance.

## Current status

```text
STEP015A=SOURCE_PACKAGE_ACCEPTED_CANDIDATE
STEP015B=IMPLEMENTED_SOURCE_PACKAGE_VALIDATION_IN_PROGRESS
STEP015B_DOCKER_LIVE=PENDING
BROWSER=NOT_IN_SCOPE
OFFICIAL_PRODUCT_BASELINE=STEP014_PRODUCT_CORE_ACCEPTED
```
