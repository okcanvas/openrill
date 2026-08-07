# STEP013B1 Local Candidate Validation

## Identity

```text
step=STEP013B1_PLAYWRIGHT_ADAPTER_AND_READ_ONLY_BROWSER_OBSERVATION
version=0.13.5-step013b1
schema=9
accepted_baseline=STEP013AR4_ACCEPTANCE_STAGE_RUNNER_FIXTURE_IMPORT_ALIGNMENT
accepted_baseline_zip_sha256=4ea292f9e68b6774a7828565e1e7e8d5df7b4c778b36ad5891e1ea6adf2fc61e
state=LOCAL_CANDIDATE_WINDOWS_LIVE_PENDING
```

## Completed local evidence

```text
typescript_project_build=PASS
focused_browser_observation=5/5 PASS
focused_playwright_boundaries=5/5 PASS
retained_browser_runtime=13/13 PASS
retained_browser_boundaries=8/8 PASS
focused_total=31/31 PASS
canonical_serial=274/274 PASS
canonical_unit_files=50
canonical_skipped=0
architecture=26 packages / 64 edges / 110 sources
exports=26/26 PASS
source_version_alignment=27 manifests / 26 source identities / 3 Host literals
workspace_lock_alignment=27 importers / 67 dependencies
workspace_module_links=64 edges / current-root owned
package_manifest=840 files / changed 0
```

## Aggregate result

```text
STEP013B1_PLAYWRIGHT_ADAPTER_AND_READ_ONLY_BROWSER_OBSERVATION checks=81/82 state=FAILED schema=9 baseline=STEP013AR4 adapter=PLAYWRIGHT_CORE tools=READ_ONLY_6 refs=DOCUMENT_GENERATION_SCOPED stale_ref=BROWSER_STALE_REF process_count=0 chromium_orphan=0
```

The single failed stage was `browser-live`. The environment had a system Chromium executable but did not contain the exact `playwright-core` package and its configured internal npm registry returned 404 for that package. The code now preserves the actual adapter diagnostic:

```text
BROWSER_LAUNCH_FAILED:
browser launch failed: OPENRILL_PLAYWRIGHT_CORE_UNAVAILABLE:
playwright-core 1.62.0 is required; run pnpm install --frozen-lockfile
```

This evidence does not prove a Playwright API or real Chromium vertical slice. It proves that every preceding source, build, focused, canonical, architecture, export, lock, module-link, and package-manifest gate passes and that the unavailable concrete dependency fails clearly.

## Remaining acceptance

On Windows with the exact lock-installed dependency graph:

```cmd
pnpm install --frozen-lockfile
pnpm acceptance:step013b1
```

The cut becomes accepted only when the concrete local fixture stage proves:

```text
browser.list
browser.navigate
browser.snapshot role/name/ref
navigation generation advance
old ref BROWSER_STALE_REF
new snapshot/new refs
browser.close
adapter activeProcessCount=0
Chromium marker orphan=0
```

Until then, STEP013AR4 remains the official accepted baseline.
