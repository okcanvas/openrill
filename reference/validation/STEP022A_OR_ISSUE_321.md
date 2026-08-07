# OR-ISSUE-321 — Fresh source ZIP export verification ran before build

```text
ISSUE=OR-ISSUE-321
FIRST_OBSERVED=STEP022A FRESH ZIP VALIDATION
CLASSIFICATION=VALIDATION ORDER / GENERATED OUTPUT PREREQUISITE
```

## Failure

Fresh source verification invoked `node scripts/check-exports.mjs` immediately after extraction. The package intentionally excludes every `dist` directory, so the verifier failed while importing `apps/agent-cli/dist/index.js`.

## Direct cause

The validation sequence treated a build-dependent runtime export gate as a source-only archive gate. This was not a Product failure and did not indicate a missing source file: deterministic packaging deliberately excludes generated outputs.

## Correction

Fresh source-only verification is limited to ZIP integrity, generated-output absence, source version, lock alignment, source-root boundary, package manifest, and architecture. Workspace module links, build, exports, and tests run only after `pnpm install --frozen-lockfile` and workspace build materialization. The official aggregate already orders `workspace-build` before `exports`.

## Recurrence gate

STEP022A governance requires the package script to exclude `dist`, the aggregate to place `workspace-build` before `exports`, and the Fresh acceptance evidence to state that export verification is build-dependent.
