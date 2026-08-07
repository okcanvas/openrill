# OR-ISSUE-397 — Mutable package manifest tools retained STEP022C while STEP023A version advanced

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: package identity ownership / repeated partial version advance
- Failure: `generate_package_manifest.py` and `verify_package_manifest.py` carried version `0.25.0-step023a` but still emitted STEP022C as the package step, producing a split identity.
- Correction: both mutable manifest tools now own the exact STEP023A step and version before the manifest is regenerated.
- Product impact: packaging metadata only; Product runtime semantics are unchanged.
