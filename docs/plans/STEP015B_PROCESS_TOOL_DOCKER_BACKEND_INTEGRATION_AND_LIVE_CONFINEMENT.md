# STEP015B — Process Tool Docker Backend Integration and Live Confinement

## Identity

```text
STEP015B_PROCESS_TOOL_DOCKER_BACKEND_INTEGRATION_AND_LIVE_CONFINEMENT
version=0.15.1-step015b
state_schema=15
previous_candidate=STEP015A_EXECUTION_BACKEND_CONTRACT_AND_DOCKER_CONFINEMENT_PLAN_FOUNDATION
accepted_product_baseline=STEP014_PRODUCT_CORE_ACCEPTED
browser=NOT_IN_SCOPE
```

## Product scope

1. route the Host Product `process.run` path through `ExecutionBackend` selection;
2. select Docker only when explicitly configured and available;
3. deny unavailable Docker by default and permit Host fallback only when explicitly configured;
4. persist backend kind, handle identity, sandbox claim, and confinement proof with every Process record;
5. preserve foreground, background, timeout, cancel, tail, recovery, and approval behavior;
6. upgrade durable State from schema 14 to 15 without rewriting historical Process rows;
7. provide an actual Docker-daemon live fixture without any browser dependency.

## Configuration

```yaml
execution:
  backend: docker        # host | docker
  fallback: deny         # deny | host
  mountMode: readOnly    # readOnly | readWrite
  networkMode: none      # none | outbound
  docker:
    image: repository/image@sha256:<64 lowercase hex>
    executable: docker
    memoryBytes: 536870912
    pidsLimit: 256
```

Defaults remain Host, fallback deny, read-only authority, and network none. A Docker image is mandatory and
must be digest-pinned when `backend=docker`.

## Durable Process evidence

State schema 15 adds:

```text
backend_kind
backend_handle_id
sandboxed
confinement_json
```

Existing rows migrate to explicit `HOST`, `sandboxed=0`, and null handle/proof values. New backend-routed
rows bind the prepared handle and exact confinement proof before execution becomes RUNNING.

## Resource ownership

The selected backend is resolved before Process files are created. Secret environment resolution is also
completed before backend preparation. If backend preparation succeeds but durable binding fails, the handle
is closed before the Process is returned as failed. Background cancellation remains durable and manager
shutdown waits for backend cancellation, execution settlement, and cleanup.

OR-ISSUE-197 records the actual Host-route root-cwd regression found and fixed during focused validation.

## Validation profile

### Source/package candidate

- no browser or Chromium;
- full workspace build;
- STEP015B focused Product integration;
- affected Process/State/Sandbox regression;
- governance regression;
- canonical suite once for package candidate;
- architecture, exports, manifest, deterministic ZIP, fresh extraction.

### Docker live promotion

Requires `OPENRILL_STEP015B_DOCKER_IMAGE` with a digest-pinned Linux image that provides `sh`, `sleep`,
`cat`, and `/proc`/`/sys` views. The real Docker fixture proves:

- daemon availability;
- exact-profile stale prune;
- Process Tool Docker routing and durable confinement proof;
- read-only read success and write denial;
- read-write persistence;
- network-none isolation and explicitly requested bridge attachment;
- timeout and background cancellation;
- zero managed containers after cleanup.

Local source acceptance does not claim Docker live when the daemon is unavailable.

## Time ledger

```text
started_at=2026-08-04T21:38:00+09:00
ended_at=2026-08-04T22:29:30+09:00
human_work_minutes=NOT_RECORDED
automated_run_seconds=46.453
```

## Local source/package result

```text
checks=63/63 PASS
focused_product=9/9
affected_regression=40/40
focused_governance=17/17
canonical=89 files / 505/505 / skipped=0
manifest=1212/1212
final_source_manifest=1214/1214
browser=NOT_RUN
docker_live=PENDING_ENV
promotion=DOCKER_LIVE_PENDING
```

The official Product baseline is not promoted by this source/package result.
