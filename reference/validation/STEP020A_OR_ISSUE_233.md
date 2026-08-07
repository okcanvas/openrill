# OR-ISSUE-233 — Offline package-manager bootstrap could not fetch pnpm

## Observation

During STEP020A lock refresh, `corepack pnpm install --lockfile-only` failed before Product compilation with `EAI_AGAIN registry.npmjs.org` while Corepack attempted to obtain pnpm `11.15.1`.

## Direct cause

The validation environment had no usable npm registry network path. This was an environment/bootstrap failure, not a Product dependency or lock inconsistency.

## Correction

- Do not claim that an online install ran in this environment.
- Align `pnpm-lock.yaml` from the actual workspace manifests, including the new `packages/tasks` importer and Host dependency.
- Verify the resulting graph with `scripts/verify_workspace_lock_alignment.py`.
- Retain `pnpm install --frozen-lockfile` as the required clean Windows operator command.

## Recurrence proof

STEP020A acceptance requires workspace lock alignment before build and records Windows frozen-lockfile installation separately from local source/package acceptance.
