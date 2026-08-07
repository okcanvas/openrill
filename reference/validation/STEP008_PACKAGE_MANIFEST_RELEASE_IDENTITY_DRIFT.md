# STEP008 Package Manifest Release Identity Drift

## Issue

`OR-ISSUE-018`

## Exact symptom

After STEP008 implementation and a successful `175/175` deterministic acceptance, direct source inspection before packaging found that both manifest scripts still declared the previous release:

```python
# scripts/generate_package_manifest.py
"step": "STEP007_AGENT_KERNEL_AND_MODEL_ADAPTER",
"version": "0.7.0-step007",

# scripts/verify_package_manifest.py
manifest.get("step") == "STEP007_AGENT_KERNEL_AND_MODEL_ADAPTER"
manifest.get("version") == "0.7.0-step007"
```

Running the uncorrected generator would therefore produce a byte-valid manifest whose release identity was false.

## Code-confirmed root cause

The two scripts stored STEP and version as independent literals copied from STEP007. The STEP008 acceptance validated all 26 npm manifest versions, but did not inspect the package-manifest generator, verifier, or generated `PACKAGE_MANIFEST.json` release identity.

## Impact

- A STEP008 ZIP could identify itself as STEP007 despite containing STEP008 code.
- The verifier could accept the same stale identity because it repeated the same old literals.
- ZIP-only handoff and SHA/manifest evidence would be internally contradictory.

## Fix

Both scripts now declare the current release through explicit shared-shape constants in each executable:

```python
STEP = "STEP008_WORKSPACE_AND_FILE_TOOLS"
VERSION = "0.8.0-step008"
```

The generator writes these values and the verifier requires them. `PACKAGE_MANIFEST.json` is regenerated only after the final deterministic report is stable.

## Recurrence-prevention gate

`run_step008_acceptance.py` now verifies all of the following:

- generator STEP and version constants equal the current acceptance identity;
- verifier STEP and version constants equal the current acceptance identity;
- generated `PACKAGE_MANIFEST.json` declares the same STEP and version;
- Issue Registry, this detailed evidence, and the `Package manifest release identity` recurrence section all exist.

Packaging additionally performs a post-acceptance `verify_package_manifest.py` run and a fresh-ZIP rerun.
