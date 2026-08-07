# OR-ISSUE-108 — Browser payload and Artifact envelope limit mismatch

## Exact symptom

An adapter payload accepted at exactly the generic 8 MiB Artifact limit could still fail during Artifact creation after Browser `source.json` and generic `metadata.json` were added.

## Code-confirmed root cause

The initial Browser output defaults equaled the total `WorkspaceArtifactStore` limit. The store accounts for every payload/control file, so a maximum-sized screenshot or download left no room for the required metadata envelope. Final code review also found that Playwright page titles were copied into snapshot and screenshot metadata without an explicit bound, so metadata headroom was not fully composable even after the payload reservation.

## Impact

A payload could pass the Browser bound and then fail at a later storage layer with `BROWSER_ARTIFACT_FAILED` rather than the intended early `BROWSER_OUTPUT_TOO_LARGE`. An unusually large title could likewise consume metadata headroom unpredictably. The payload and metadata limits did not compose into one deterministic contract.

## Fix

Default Browser screenshot and download payload limits are `8 MiB - 64 KiB`, reserving bounded headroom for `source.json` and `metadata.json`. Provider-neutral page titles are truncated to 4,096 characters at the Playwright adapter boundary for `title()`, snapshot, and screenshot metadata. Adapter overflow is mapped to `BROWSER_OUTPUT_TOO_LARGE` before Artifact metadata is committed.

## Recurrence-prevention gates

- STEP013B3 boundary tests assert the explicit 64 KiB headroom, generic 8 MiB envelope, and 4,096-character title bound at every public title capture path;
- focused behavior tests force screenshot/download overflow and require zero metadata commits;
- the real-browser live fixture serves a 5,000-character title and requires exactly 4,096 characters in screenshot source metadata;
- the same fixture downloads a 96 KiB payload under a 64 KiB limit and verifies fail-before-commit behavior.
