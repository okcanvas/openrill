# STEP013CR2 Current Package Manifest Identity Freeze

## Symptom

Before final sealing, `PACKAGE_MANIFEST.json` contained:

```text
step=STEP013B3_BROWSER_ARTIFACTS_AND_BOUNDED_EVIDENCE
version=0.13.8-step013b3
```

while root and all workspace source identities were `STEP013CR2 / 0.13.11-step013cr2`.

## Root cause

`generate_package_manifest.py` and `verify_package_manifest.py` retained the last accepted baseline literals instead of the current package identity. The verifier therefore validated a stale identity consistently.

## Correction

Both scripts and the generated manifest now own the current corrective STEP/version. The accepted baseline remains independently owned by `config/current-accepted-baseline.json`; package identity and accepted identity are not conflated.

## Recurrence protection

The focused test and acceptance static gates require generator, verifier, and generated manifest to match root current identity.
