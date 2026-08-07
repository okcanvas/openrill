# OR-ISSUE-083 — STEP013A Windows workspace lock importer drift

## Exact command and symptom

```cmd
cd /d D:\NODE_AGENTS\okcanvas-openrill
pnpm acceptance:step013a
```

The actual Windows run passed BrowserRuntime focused tests, boundary tests, historical Host fixtures, and the canonical suite, but failed both package-manifest gates:

```text
[FAIL] package-manifest-initial :: OPENRILL_PACKAGE_MANIFEST_FAIL declared=776 actual=776 missing=0 extra=0 changed=1 changed_paths=pnpm-lock.yaml
[FAIL] package-manifest-final :: OPENRILL_PACKAGE_MANIFEST_FAIL declared=776 actual=776 missing=0 extra=0 changed=1 changed_paths=pnpm-lock.yaml
STEP013A_BROWSER_RUNTIME_LIFECYCLE_AND_POLICY_FOUNDATION checks=136/138 state=FAILED
```

## Root cause

STEP013A added this dependency to `services/agent-host/package.json`:

```json
"@openrill/browser-runtime": "workspace:*"
```

The packaged `pnpm-lock.yaml` retained the STEP012DR4 `services/agent-host` importer and omitted the corresponding entry:

```yaml
'@openrill/browser-runtime':
  specifier: workspace:*
  version: link:../../packages/browser-runtime
```

pnpm 11 checks dependency state before `pnpm run`. With its default `verifyDepsBeforeRun=install`, the Windows command performed an implicit install before the Python acceptance script and rewrote the stale lock importer. The package manifest correctly detected that source mutation.

This was not a BrowserRuntime product failure and was not a line-ending-only difference. The package manifest and lock importer represented different dependency graphs.

## Impact

- The candidate ZIP was not immutable under the documented Windows validation command.
- A fresh environment could materialize a dependency graph different from the packaged lock representation.
- Focused and canonical tests could pass while the release package contract was already invalid.

## Pre-fix reproduction

1. Read `services/agent-host/package.json` and observe `@openrill/browser-runtime`.
2. Read the `services/agent-host` importer in `pnpm-lock.yaml` and observe the dependency is absent.
3. Run `pnpm acceptance:step013a` with pnpm 11.15.1 on Windows.
4. Observe pnpm's dependency verification/install before the acceptance script and `changed_paths=pnpm-lock.yaml` at both manifest gates.

## Fix

- Add the missing BrowserRuntime workspace dependency to the Host lock importer.
- Add `scripts/verify_workspace_lock_alignment.py` to compare all 26 workspace package manifests with all lock importers.
- Compare the exact dependency-name sets for `dependencies`, `devDependencies`, and `optionalDependencies`.
- Configure `verifyDepsBeforeRun: error` so `pnpm run` never silently installs and mutates packaged source. Dependency installation remains an explicit preceding command.
- Add a negative fixture that removes a workspace dependency and requires bounded importer-specific evidence.

## Automated recurrence prevention

- `python scripts/verify_workspace_lock_alignment.py`
- `tests/unit/workspace-lock-alignment-step013ar1.test.mjs` — 3/3
- STEP013AR1 static Host importer assertion
- STEP013AR1 initial and final package-manifest gates
- full serial canonical suite with skipped-zero
- fresh-ZIP acceptance and repack comparison

## Closure condition

The issue closes only after Windows reports the exact STEP013AR1 PASSED marker with `lock_importers=EXACT`, and both package-manifest gates remain unchanged.
