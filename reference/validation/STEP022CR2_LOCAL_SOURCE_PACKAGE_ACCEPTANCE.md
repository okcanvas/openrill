# STEP022CR2 Local Source Package Acceptance

```text
STEP=STEP022CR2_INTEGRATED_MATTERMOST_TESTBED_SINGLE_ROOT_BOOTSTRAP
PRODUCT_STEP=STEP022C_MATTERMOST_REAL_CONNECTOR_DURABLE_VERTICAL_SLICE
PRODUCT_VERSION=0.24.0-step022c
STATE_SCHEMA=25
PRODUCT_RUNTIME_MODIFICATIONS=0
STATE=LOCAL_STAGED_EXACT_ACCEPTED
DOCKER_LIVE=NOT_RUN
WINDOWS_MATTERMOST_LIVE=PENDING
```

## Purpose

Correct the validation packaging only: one full OpenRill ZIP must contain the real local Mattermost Testbed and must run from the actual OpenRill root without an invented second directory or a mandatory path argument.

## Executed evidence

```text
source_version=0.24.0-step022c / 38 manifests / 37 PACKAGE_VERSION sources / 3 Host literals
workspace_lock=38 importers / 102 dependencies
workspace_module_links=99 edges / 37 materialized
source_root_archive_violations=0
workspace_build=PASSED
step022c_focused=24/24
step022cr2_testbed_and_governance=12/12
retained_product=61/61
affected_regression=23/23
governance=243/243
canonical_files=183
canonical_tests=957/957
canonical_failed=0
canonical_skipped=0
canonical_reconciliation=183 expected / 183 executed / 183 unique / order exact / missing 0 / extra 0
architecture=37 packages / 99 edges / 186 sources
exports=37/37
```

The unchanged STEP022C aggregate was executed through all pre-canonical stages successfully. The surrounding tool call terminated during its long canonical stage without a Product failure marker. The exact same canonical runner was then executed over the full sorted 183-file list in deterministic groups; every file and all 957 tests passed, and the group list reconciled exactly with the canonical file list. This is recorded as staged exact local acceptance, not as Windows Mattermost Live.

## Integrated runtime command

From the actual OpenRill root on Windows CMD:

```cmd
start-and-run-step022c-live.cmd
```

PowerShell:

```powershell
.\start-and-run-step022c-live.ps1
```

No `OpenRillRoot` parameter exists. The PowerShell wrapper runs `pnpm install --frozen-lockfile`, then invokes the integrated Testbed runner. The runner derives the same OpenRill root from its own checked-in location and executes the unchanged `pnpm acceptance:step022c:live` with in-memory Mattermost credentials.

## Failure-prevention evidence

OR-ISSUE-366 through OR-ISSUE-371 are individually recorded. External source assumptions are recorded in `reference/MATTERMOST_TESTBED_SOURCE_VERIFICATION.md`.
