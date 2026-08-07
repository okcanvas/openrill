# STEP013B2 local validation

## Environment

```text
node=22.16.0
python=available
playwright-core_1.62.0=NOT_INSTALLED_IN_LOCAL_CONTAINER
network_install=NOT_PERFORMED
```

## Passed evidence

```text
source_version_alignment=PASS version=0.13.7-step013b2 manifests=27 sources=26 host_literals=3
workspace_lock_alignment=PASS importers=27 dependencies=67
workspace_module_links=PASS edges=64 materialized=26
workspace_build=PASS
focused_browser_and_reporter=49/49 PASS
canonical_serial=292/292 PASS
unit_files=54
skipped=0
architecture=26 packages / 64 edges / 110 sources PASS
exports=26/26 PASS
```

The canonical wrapper produced:

```text
OPENRILL_ARCHITECTURE_PASS packages=26 edges=64 sources=110 ui_framework=VUE_3
OPENRILL_PACKAGE_EXPORT_PASS packages=26
OPENRILL_STEP001_SUITE_PASS unit_files=54 reporter=TAP concurrency=1
```

## Local aggregate

```text
STEP013B2_BROWSER_INTERACTIONS_NAVIGATION_STATE_AND_DIALOG_BLOCKER checks=133/134 state=FAILED schema=9 baseline=STEP013B1A adapter=PLAYWRIGHT_CORE tools=12 interactions=6 navigation_state=INLINE stale_ref_recovery=SNAPSHOT dialog=BLOCK_AND_DISMISS reporter=TAP process_count=0 chromium_orphan=0
only_failed_stage=browser-live
expected_windows_total=134/134
```

The aggregate itself reconfirmed source/version/lock/module links, initial/final package manifest, build, all focused groups, canonical suite, architecture, and exports before reporting the single live prerequisite failure.

The aggregate additionally wrote complete stage captures under `.artifacts/acceptance/STEP013B2_STAGES/`. The canonical capture exceeded 65 KB and passed 292/292; the failed Browser live report retained the exact full-log path and complete missing-Playwright assertion rather than a tail-only diagnostic.

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

- Code, static boundaries, focused behavior, canonical suite, architecture, exports, and deterministic manifest gates are locally verifiable.
- Real click/type/select/fill/press/wait, navigation interception, modal dialog handling, and Chromium orphan-zero must be confirmed by the Windows aggregate with the frozen dependency installation.

## Deterministic packaging and fresh extraction

```text
source_zip_repack=BYTE_IDENTICAL
packaged_files=874
fresh_manifest=873/873 changed=0
fresh_source_version=PASS
fresh_lock_alignment=PASS
fresh_module_links=64 edges / 26 materialized PASS
fresh_build=PASS
fresh_focused=49/49 PASS
fresh_canonical=292/292 PASS
fresh_unit_files=54 skipped=0
fresh_architecture=26/64/110 PASS
fresh_exports=26/26 PASS
```

The fresh validation root used only the packaged source plus locally materialized workspace links and the already-installed external Node type dependency. No source file was copied from the mutable worktree.
