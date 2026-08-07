# STEP013C Local Validation

## Status

This source container does not contain exact `playwright-core 1.62.0`. The official accepted baseline remains STEP013B3 until the complete Windows STEP013C marker passes.

## Verified local results

```text
source version alignment=PASS manifests=27 sources=26 host_literals=3
workspace lock alignment=PASS importers=27 dependencies=67
workspace module links=PASS edges=64 materialized=26
workspace build=PASS
focused Browser/Automation suites=76/76 PASS
canonical serial suite=320/320 PASS
unit files=58
skipped=0
architecture=26 packages / 64 edges / 112 sources
exports=26/26 PASS
package manifest=912/912 changed=0
packaged source files=913
final fresh ZIP build=PASS
final fresh ZIP focused=76/76 PASS
final fresh ZIP canonical=320/320 PASS
final fresh ZIP architecture=26/64/112 PASS
final fresh ZIP exports=26/26 PASS
```

The aggregate completes every static, focused, canonical, architecture, export, and manifest stage and fails only the real Browser prerequisite:

```text
STEP013C_AUTOMATION_BROWSER_EXECUTION_DURABLE_LEDGER_AND_RESTART_RECOVERY checks=120/121 state=FAILED schema=11 baseline=STEP013B3 adapter=PLAYWRIGHT_CORE tools=15 automation_browser=AUTONOMOUS ledger=ACTION_EVIDENCE recovery=RESUME_AND_REOPEN reporter=TAP process_count=0 chromium_orphan=0

BROWSER_LAUNCH_FAILED
OPENRILL_PLAYWRIGHT_CORE_UNAVAILABLE
playwright-core 1.62.0 is required; run pnpm install --frozen-lockfile
```

The failed `browser.open` is itself durably recorded as `FAILED/BROWSER_LAUNCH_FAILED`; no successful Browser launch, crash/restart recovery, or Windows acceptance is claimed from this environment.

## Expected Windows marker

```text
STEP013C_AUTOMATION_BROWSER_EXECUTION_DURABLE_LEDGER_AND_RESTART_RECOVERY checks=121/121 state=PASSED schema=11 baseline=STEP013B3 adapter=PLAYWRIGHT_CORE tools=15 automation_browser=AUTONOMOUS ledger=ACTION_EVIDENCE recovery=RESUME_AND_REOPEN reporter=TAP process_count=0 chromium_orphan=0
```

## Sealing contract

The final source ZIP was created twice with fixed ZIP timestamps, sorted paths, fixed permissions, and DEFLATE level 9. Byte equality and SHA-256 equality passed. The final ZIP was then extracted to a new root, workspace links are rematerialized only to that root, and manifest/build/focused/canonical/architecture/exports were rerun and passed.
