# STEP013B1A Local Validation

## Identity

```text
step=STEP013B1A_WINDOWS_DETERMINISTIC_FOCUSED_TEST_REPORTER_ALIGNMENT
version=0.13.6-step013b1a
schema=9
baseline=STEP013AR4
retained_feature=STEP013B1
```

## Code-level validation

```text
source_version_alignment=PASS manifests=27 sources=26 host_literals=3
workspace_lock_alignment=PASS importers=27 dependencies=67
workspace_module_links=PASS edges=64 materialized=26 root_owned=true
workspace_build=PASS
focused_reporter=4/4 PASS
focused_browser_observation=5/5 PASS
focused_browser_adapter_boundaries=5/5 PASS
focused_browser_runtime=13/13 PASS
focused_browser_boundaries=8/8 PASS
focused_total=35/35 PASS
canonical_serial=278/278 PASS
unit_files=51
skipped=0
architecture=26_packages/64_edges/110_sources PASS
exports=26/26 PASS
package_manifest=PASS
```

All focused Node commands used explicit `--test-reporter=tap`.

## Local Browser live prerequisite

The build container does not contain the exact package-local `playwright-core 1.62.0` installation. The live fixture therefore failed closed before Chromium launch with the preserved diagnostic:

```text
BROWSER_LAUNCH_FAILED:
OPENRILL_PLAYWRIGHT_CORE_UNAVAILABLE:
playwright-core 1.62.0 is required;
run pnpm install --frozen-lockfile
```

This is the expected prerequisite boundary already covered by OR-ISSUE-095. It is not treated as a passed local live run.

## Windows evidence inherited from STEP013B1 run

The user-provided STEP013B1 Windows output listed exactly four failed checks, all focused test reporter predicates. Each child suite passed and returned code 0. The acceptance runner prints every failed check, and `browser-live` was absent. Therefore that execution passed the concrete Playwright fixture, stale-ref behavior, close path, adapter process count zero, and Chromium orphan zero, while the overall aggregate remained failed because of OR-ISSUE-096.

## Current status

```text
code_and_canonical=PASS
windows_browser_feature_evidence=PASS_WITHIN_FAILED_PREDECESSOR_AGGREGATE
corrected_step013b1a_full_windows_aggregate=PENDING
accepted_baseline=STEP013AR4_UNCHANGED
```
