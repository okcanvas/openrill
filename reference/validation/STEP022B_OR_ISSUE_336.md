# OR-ISSUE-336 — Cumulative governance ran before STEP022B manifest regeneration

The current root documents had advanced to STEP022B while `PACKAGE_MANIFEST.json` still contained STEP022A identity. A historical governance gate correctly compared current root documents to the current manifest and failed.

The Product was not changed. The package process now regenerates the manifest before cumulative governance and regenerates it after final evidence updates.
