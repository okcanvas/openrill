# STEP015B Local Source/Package Validation

## Identity

```text
STEP015B_PROCESS_TOOL_DOCKER_BACKEND_INTEGRATION_AND_LIVE_CONFINEMENT
version=0.15.1-step015b
state_schema=15
accepted_product_baseline=STEP014_PRODUCT_CORE_ACCEPTED
validation_dimension=SOURCE_PACKAGE
docker_live=PENDING_ENV
browser=NOT_RUN
```

## Final aggregate

```text
checks=63/63
state=PASSED
promotion=DOCKER_LIVE_PENDING
automated_run_seconds=46.453
```

## Evidence

```text
source/version=29 manifests / 28 sources / 3 Host literals
workspace lock=29 importers / 74 dependencies
workspace links=71 edges / 28 materialized
zero-dist build=PASS
focused STEP015B Product=9/9
affected Process/State/Sandbox regression=40/40
focused validation governance=17/17
canonical=89 files / 6 batches / 505/505 / skipped=0
architecture=28 packages / 71 edges / 121 sources
exports=28/28
manifest=1212/1212
final_source_manifest=1214/1214
browser=NOT_RUN
docker_live=PENDING_ENV
```

## Environment boundary

This container does not provide a usable Docker executable/daemon, so the actual Docker live
fixture was not executed and no live confinement claim is made. The source/package profile uses
injected Docker executors only for deterministic command/lifecycle tests.

The local workspace also uses environment-provided TypeScript/Node type packages rather than
claiming a fresh `pnpm install --frozen-lockfile` with the exact lock versions. The final ZIP keeps
only source and lock data; `node_modules`, `dist`, and `.artifacts` are excluded.

## Failure assets closed during this STEP

- OR-ISSUE-197 — canonical workspace root `""` was not normalized to backend cwd `.`;
- OR-ISSUE-198 — zero-dist build order depended on stale Sandbox declarations;
- OR-ISSUE-199 — historical timeout test froze the complete execution config object;
- OR-ISSUE-200 — STEP014C boundary froze current State schema 14;
- OR-ISSUE-201 — the exact-schema recurrence class was initially fixed file-by-file rather than
  swept repository-wide;
- OR-ISSUE-202 — current root handoff documents omitted accepted-baseline checks and SHA.

## Promotion boundary

The official accepted Product baseline remains `STEP014_PRODUCT_CORE_ACCEPTED`. STEP015B becomes
promotion-ready only after the separate real Docker command passes:

```cmd
set "OPENRILL_STEP015B_DOCKER_IMAGE=repository/image@sha256:<64 lowercase hex>"
pnpm acceptance:step015b:live
```
