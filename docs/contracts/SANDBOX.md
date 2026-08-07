# Sandbox Execution Backend Contract

## Owners

- provider-neutral contract and policy: `@openrill/sandbox`;
- Docker CLI implementation: `@openrill/sandbox-docker`;
- Product routing and durable Process evidence: `@openrill/tools-process`;
- configuration and Host composition: `@openrill/config` and `@openrill/host`.

## Backend handle

A handle exposes:

- `id`, `kind`, `createdAt`;
- capabilities;
- workspace authority;
- confinement proof;
- bounded argv execution with start/stdout/stderr observation;
- cancel and idempotent close.

Every backend implements `doctor()` before selection. Docker availability never causes an implicit Host
fallback.

## Workspace authority

Exactly one configured workspace root is authorized at `/workspace`.

- default mount: `READ_ONLY`;
- `READ_WRITE` cannot widen a read-only workspace;
- extra host binds are denied;
- Docker socket mount is denied;
- cwd remains workspace-relative;
- canonical workspace-root `cwdRelative=""` is normalized to `.` only at backend invocation.

## Network and fallback

- network default: `NONE`;
- outbound network requires explicit configuration/policy;
- Docker-unavailable fallback default: `DENY`;
- Host fallback requires explicit configuration/policy;
- Host capability and proof always report `sandboxed=false`.

## Docker confinement

- immutable digest-pinned image;
- `--network none` by default and bridge only for explicit outbound mode;
- read-only container root;
- all Linux capabilities dropped;
- `no-new-privileges`;
- bounded PID and memory limits;
- one configured workspace bind;
- exact OpenRill managed/profile labels;
- timeout kills the owned container;
- cancel kills the owned container;
- close removes it idempotently;
- stale prune is restricted to exact managed/profile labels.

The configured image must provide the command runtime requested by the user. The STEP015B live fixture uses
a digest-pinned Linux image with `sh`, `sleep`, `cat`, `/proc`, and `/sys`.

## Product Process evidence

State schema 15 stores:

- backend kind;
- backend handle ID;
- whether the backend claims sandboxing;
- exact confinement proof JSON.

Historical Process rows migrate to explicit Host/non-sandbox defaults. New Process records bind backend
identity/proof before RUNNING. Backend selection and secret resolution occur before Process lifecycle files
or containers are created.

## Validation

- source acceptance uses injected Docker CLI and Product-router tests;
- Docker promotion uses the actual Docker daemon through `ProcessManager`;
- browser/Chromium is not part of this contract or STEP015B acceptance.
