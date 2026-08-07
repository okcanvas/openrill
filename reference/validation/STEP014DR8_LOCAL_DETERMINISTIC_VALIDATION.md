# STEP014DR8 Local Deterministic Validation

## Candidate

```text
STEP014DR8_VUE_RUNTIME_MATERIALIZATION_AND_BROWSER_BOOTSTRAP_EVIDENCE_CLOSURE
version=0.14.11-step014dr8
schema=14
baseline=STEP013CR2_SQLITE_NULL_PROTOTYPE_LIVE_ASSERTION_ALIGNMENT
retained_feature=STEP014D_DELEGATED_WORK_CONTROL_UI_AND_WINDOWS_VERTICAL_SLICE
```

## Code-confirmed Windows failure diagnosis

The supplied real Windows STEP014DR7 output reached `319/320`. `external-model-parallel-live` passed and only `deterministic-nested-control-ui-live` failed at:

```text
OPENRILL_STEP014DR7_WAIT_TIMEOUT:delegation-nav:false
```

Source inspection establishes the direct missing chain:

1. `apps/agent-web/public/index.html` requires `/vendor/vue.runtime.global.prod.js`.
2. The source package intentionally contains no generated `apps/agent-web/public/vendor` directory.
3. `scripts/workspace-runner.mjs` materializes `dist/public/vendor` only when `OPENRILL_VUE_RUNTIME_VENDOR_DIR` is supplied during build.
4. `scripts/run_step014dr7_acceptance.py` neither acquired Vue nor supplied that environment variable to `focused-build`.
5. The DR7 deterministic UI fixture checked the served index and browser module, but did not verify the Host-served Vue runtime, `Page.navigate.errorText`, startup phase or bounded browser page/network evidence.

The missing mounted `nav-delegations` element was therefore an acceptance bootstrap regression and recurrence of OR-ISSUE-074, not evidence of a delegation runtime or external-model failure.

## Corrections and recorded issues

- OR-ISSUE-184 — aggregate ownership dropped the exact Vue acquisition/materialization chain.
- OR-ISSUE-185 — browser bootstrap failure was collapsed into a selector timeout without served-runtime or page evidence.
- OR-ISSUE-186 — a retained DR7 test froze the mutable current root version.
- OR-ISSUE-187 — Chromium failures before `launch()` returned lacked complete local cleanup ownership.
- OR-ISSUE-188 — the lifecycle audit inventory omitted the current DR8 fixture family.
- OR-ISSUE-189 — the outer live-fixture owner swallowed cleanup-only and body-plus-cleanup failures.

DR8 now owns exact Vue 3.5.40 acquisition, independent re-extraction, lock/archive/runtime/license verification, vendor-aware build propagation, actual Host static serving verification, `Page.navigate.errorText`, bounded CDP page evidence, `startupPhase=READY`, depth-2 tree assertions and complete cleanup failure preservation.

## Worktree deterministic validation

```text
static acceptance contracts: 317/317 PASS
focused stages:              25/25 PASS
focused tests:               137/137 PASS
canonical files:             85/85 PASS
canonical tests:             467/467 PASS
canonical skipped:           0
source/version:               28 manifests / 27 sources / 3 Host literals PASS
workspace lock:               28 importers / 70 dependencies PASS
workspace links:              67 edges / 27 materialized PASS
source-root archives:         0 PASS
architecture:                 27 packages / 67 edges / 116 sources PASS
exports:                      27/27 PASS
lifecycle audit inventory:    HTTP 8 / Host 5 / Chromium 5 PASS
package manifest:             1165/1165 PASS
packaged files:               1166
```

The current aggregate contains 317 static contracts and 41 executable stages, so the exact Windows success target is `358/358`.

## Fresh source ZIP validation

The deterministic source ZIP was extracted into a new root containing no `dist`, `.artifacts` or `node_modules`. The following were repeated from that extracted source:

```text
manifest:                     1165/1165 PASS
source/version:               28 / 27 / 3 PASS
workspace lock:               28 / 70 PASS
workspace links after rebuild:67 / 27 PASS
source-root boundary:         PASS
zero-dist workspace build:    PASS with environment caveat below
focused:                      137/137 PASS
canonical:                    467/467 PASS
unit files:                   85
skipped:                      0
architecture:                 27 / 67 / 116 PASS
exports:                      27/27 PASS
```

Two independent deterministic package creations are required to be byte-identical before release. The authoritative final SHA-256 is stored in the adjacent `.zip.sha256.txt`, because embedding a ZIP's own digest inside that ZIP would change the digest.

## Environment caveat — not Windows promotion evidence

The validation container had Node `22.16.0`, Python `3.13.5`, TypeScript `5.8.3` and `@types/node` `22.19.7`, while the frozen project lock requires TypeScript `6.0.3` and `@types/node` `22.20.1`. An excluded, ephemeral `node_modules` compatibility declaration was used to align `node:sqlite backup()` with the pinned contract so compilation could test the source graph. No `node_modules`, generated output or compatibility edit is packaged.

The container also had no exact cached `vue-3.5.40.tgz`, no usable external API credential and no claimable real Windows Chromium environment. Therefore these executable DR8 stages were not promoted locally:

- `vue-runtime-acquisition`, independent re-extraction and byte verification;
- vendor-aware build using the exact acquired archive;
- `external-model-parallel-live`;
- `deterministic-nested-control-ui-live`.

They remain mandatory in the user's frozen Windows installation through `pnpm acceptance:step014dr8`.

## Promotion state

```text
local source/static/focused/canonical: PASS
fresh source ZIP:                      PASS
byte-deterministic packaging:          PASS
Windows full aggregate:                PENDING
current official accepted baseline:    STEP013CR2
```

STEP014 closes only after the included Windows runner emits the exact DR8 marker with `checks=358/358 state=PASSED` and `chromium_orphan=0`.
