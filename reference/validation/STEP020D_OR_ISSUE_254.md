# OR-ISSUE-254 — Generic source-version verifier was incorrectly required to encode the STEP name

## First observation

Current identity governance required every runner, manifest verifier, and source-version verifier to contain both the STEP identity and version.

## Exact contradiction

`scripts/verify_source_version_alignment.py` is deliberately a generic current-version gate. It owns the version literal but has no need for a STEP-name constant. STEP ownership belongs to acceptance, package, and manifest scripts.

## Classification

Validation governance ownership overreach.

## Correction

Governance checks STEP+version in STEP-owned acceptance/package/live and current manifest scripts, while the generic source-version verifier is required to own the exact current version only.

## Recurrence gate

Do not add redundant identity literals solely to satisfy a test. Assertions follow the actual responsibility of each validation asset.
