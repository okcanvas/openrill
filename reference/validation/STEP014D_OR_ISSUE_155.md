# OR-ISSUE-155 — Host bootstrap version lagged behind package identity

## Symptom and code-confirmed cause

All package/source identities were moved to `0.14.3-step014d`, but two Host bootstrap payload literals remained `0.14.2-step014c`, causing the dedicated source-version verifier to fail.

## Correction

Both bootstrap/version payloads use the STEP014D version. The repository-wide source/version verifier remains the owner.

## Recurrence gate

`verify_source_version_alignment.py` checks 28 manifests, 27 source identities and all Host version literals against one version.
