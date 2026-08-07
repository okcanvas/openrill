# OR-ISSUE-198 — Zero-dist build depended on stale sandbox output

## First observed

STEP015B source/package acceptance after cleanup.

## Symptom

```text
packages/tools-process/src/index.ts: Cannot find module '@openrill/sandbox'
packages/sandbox-docker/src/index.ts: Cannot find module '@openrill/sandbox'
services/agent-host/src/lifecycle.ts: Cannot find module '@openrill/sandbox'
```

Focused tests then failed because `packages/state/dist/migrations` was absent after the failed build.

## Direct cause

`tsconfig.build.json` listed `packages/tools-process` before the newly materialized
`packages/sandbox` project. Workspace imports resolve through package `dist` exports, so the first
manual build had succeeded only because stale sandbox output already existed. The acceptance
cleanup correctly removed that output and exposed the incomplete build order.

## Classification

```text
class=PACKAGE_BUILD_GRAPH
product_runtime_defect=NO
source_package_blocking=YES
browser_related=NO
docker_daemon_related=NO
```

## Correction

The top-level TypeScript build graph now materializes:

```text
packages/sandbox
  → packages/sandbox-docker
  → packages/tools-process
  → services/agent-host
```

before consumers resolve package exports.

## Recurrence gate

STEP015B governance verifies the relative order in `tsconfig.build.json`, and package-candidate
acceptance always begins by deleting all `dist` and `.artifacts` outputs before workspace build.
A passing incremental build is not accepted as zero-dist evidence.
