# OR-ISSUE-319 — Canonical suite ran before the current package manifest was regenerated

```text
ISSUE=OR-ISSUE-319
FIRST_OBSERVED=STEP022A PRELIMINARY CANONICAL
CLASSIFICATION=VALIDATION ORDER / PACKAGE IDENTITY
PRODUCT_IMPACT=NONE
```

## Failure

The first canonical file failed because `verify_package_manifest.py` correctly required STEP022A while the repository `PACKAGE_MANIFEST.json` still declared the previous packaged identity.

## Direct cause

The preliminary canonical suite was invoked after source/version changes but before `generate_package_manifest.py`. The fixture was already correct and dynamically copied the repository manifest identity.

## Correction

Regenerate `PROJECT_TREE.txt` and `PACKAGE_MANIFEST.json` after the current source set is assembled, verify the manifest, then execute canonical. Regenerate once more after final documentation values are fixed.

## Recurrence gate

STEP022A acceptance orders package-manifest-initial before build/focused/canonical and package-manifest-final after every stage. Fresh ZIP verification repeats the manifest gate.
