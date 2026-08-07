# STEP013B3 local validation

## Environment

```text
node=22.16.0
python=available
playwright-core_1.62.0=NOT_INSTALLED_IN_LOCAL_CONTAINER
network_install=NOT_PERFORMED
build_path=node scripts/workspace-runner.mjs build
```

## Passed source evidence

```text
source_version_alignment=PASS version=0.13.8-step013b3 manifests=27 sources=26 host_literals=3
workspace_lock_alignment=PASS importers=27 dependencies=67
workspace_module_links=PASS edges=64 scopes=1 materialized=26
workspace_build=PASS
focused_browser_and_reporter=60/60 PASS
canonical_serial=303/303 PASS
unit_files=56
skipped=0
architecture=26 packages / 64 edges / 110 sources PASS
exports=26/26 PASS
package_manifest_initial_final=PASS declared=891 actual=891 changed=0
```

The canonical wrapper produced:

```text
OPENRILL_ARCHITECTURE_PASS packages=26 edges=64 sources=110 ui_framework=VUE_3
OPENRILL_PACKAGE_EXPORT_PASS packages=26
OPENRILL_STEP001_SUITE_PASS unit_files=56 reporter=TAP concurrency=1
```

## Local aggregate

```text
STEP013B3_BROWSER_ARTIFACTS_AND_BOUNDED_EVIDENCE checks=133/134 state=FAILED schema=10 baseline=STEP013B2 adapter=PLAYWRIGHT_CORE tools=15 artifacts=SCREENSHOT_DOWNLOAD evidence=CONSOLE_PAGE_ERROR_NETWORK bounds=ENFORCED reporter=TAP process_count=0 chromium_orphan=0
only_failed_stage=browser-live
expected_windows_total=134/134
```

The aggregate itself reconfirmed source/version/lock/module links, initial/final package manifest, build, all focused groups, canonical suite, architecture, and exports before reporting the single live prerequisite failure. Every external stage wrote its complete UTF-8 output under `.artifacts/acceptance/STEP013B3_STAGES/`.

## Concrete Browser stage

The local live command reached `browser.open` and failed at the exact missing dependency boundary:

```text
BROWSER_LAUNCH_FAILED:
OPENRILL_PLAYWRIGHT_CORE_UNAVAILABLE:
playwright-core 1.62.0 is required;
run pnpm install --frozen-lockfile
```

This is not a live Browser acceptance. No package download was attempted. The packaged Windows rerun remains required.

## Validation interpretation

- Code, static boundaries, migration preservation, focused behavior, canonical suite, architecture, exports, and deterministic manifest gates are locally verifiable.
- Real PNG screenshot, explicit Playwright download stream, 5,000-to-4,096 page-title bounding, evidence observation, overflow cancellation, and Chromium orphan-zero must be confirmed by the Windows aggregate with the frozen dependency installation.

## Deterministic packaging and fresh extraction

The final source ZIP is independently repacked byte-for-byte and extracted into a new root. The package contains the manifest plus 891 declared source files.

```text
source_zip_repack=PASS byte_identical=true
packaged_files=892
fresh_manifest=PASS declared=891 actual=891 changed=0
fresh_source_version=PASS version=0.13.8-step013b3 manifests=27 sources=26 host_literals=3
fresh_lock_alignment=PASS importers=27 dependencies=67
fresh_module_links=PASS edges=64 scopes=1 materialized=26
fresh_build=PASS
fresh_focused=60/60 PASS
fresh_canonical=303/303 PASS unit_files=56 skipped=0
fresh_architecture=PASS packages=26 edges=64 sources=110
fresh_exports=26/26 PASS
excluded_runtime_files=0
```
