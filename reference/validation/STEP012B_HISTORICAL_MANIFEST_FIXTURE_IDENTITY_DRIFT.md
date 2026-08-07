# STEP012B Historical Manifest Fixture Identity Drift

## Actual symptom

During the first complete STEP012B canonical suite after the release identity moved to `STEP012B / 0.12.2-step012b`, the existing STEP012AR1 manifest diagnostic test failed before it could exercise changed-path reporting:

```text
# Subtest: manifest verifier reports the exact changed repository-relative path
not ok 1
OPENRILL_PACKAGE_MANIFEST_FAIL declared=1 actual=1 missing=0 extra=0 changed=0
identity=OpenRill:STEP012AR1_ACCEPTANCE_REPORT_IMMUTABILITY_AND_MANIFEST_DIAGNOSTICS:0.12.1-step012ar1:filesExcludingManifest=1
```

## Code-confirmed root cause

`tests/unit/acceptance-report-immutability-step012ar1.test.mjs` created a temporary manifest with literal historical values:

```text
step=STEP012AR1_ACCEPTANCE_REPORT_IMMUTABILITY_AND_MANIFEST_DIAGNOSTICS
version=0.12.1-step012ar1
```

The production verifier correctly owns the current package identity and had advanced to STEP012B. Identity validation therefore failed before the fixture mutation, so the test no longer proved `changed_paths` diagnostics.

## Impact

Every future release identity change would falsely fail the canonical suite unless the historical diagnostic fixture was manually edited. Replacing the literals with STEP012B literals would only postpone the same defect to STEP012C.

## Fix

The fixture now reads the current repository `PACKAGE_MANIFEST.json` and uses its `step` and `version` when constructing the isolated temporary manifest. The historical test name and changed-path behavior remain intact, while release identity is owned by the current package manifest.

## Evidence

After the fix:

```text
acceptance-report-immutability-step012ar1.test.mjs 4/4 PASSED
canonical serial suite 190/190 PASSED
```

The test still mutates exactly one file and verifies:

```text
declared=1 actual=1 missing=0 extra=0 changed=1
changed_paths=a.txt
```

## Automated recurrence-prevention gate

- The fixture must read `PACKAGE_MANIFEST.json` into `currentIdentity`.
- Temporary manifest `step` and `version` must come from `currentIdentity`.
- The fixture must not contain a literal current or historical OpenRill release version.
- STEP012B acceptance executes this fixture inside the canonical serial suite and statically verifies identity ownership.
