# OR-ISSUE-339 — Manifest tools still emitted STEP022A identity

After STEP022B source version alignment, `generate_package_manifest.py` and `verify_package_manifest.py` still owned the previous STEP022A identity. Regeneration therefore produced a structurally current manifest with a stale step/version header.

Both mutable package-identity tools now own STEP022B. Historical package scripts remain immutable.
