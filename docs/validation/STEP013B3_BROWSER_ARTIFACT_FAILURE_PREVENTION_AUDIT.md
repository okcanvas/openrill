# STEP013B3 Browser Artifact failure-prevention audit

This audit binds STEP013B3 to OR-ISSUE-105 through OR-ISSUE-108.

## Mandatory gates

- historical STEP013A/B1/B2 tests retain their owned feature prefix and minimum schema without freezing the current Tool total or current schema;
- the current STEP alone owns exactly 15 Browser Tools and schema 10;
- migration 010 preserves all old `workspace_artifacts` rows and adds only the two Browser Artifact kinds;
- Playwright captures bytes and evidence but does not write files or metadata;
- BrowserRuntime owns Artifact policy, limits, Run ownership, ref validation, and store calls;
- old workspace Tool responses remain exactly `{artifactId, kind}`;
- suggested filenames cannot collide with `source.json` or `metadata.json`;
- Browser payload defaults reserve metadata-envelope headroom below the total Artifact limit, and page titles are bounded to 4,096 characters before entering provider-neutral observations or Artifact metadata;
- download policy is checked before stream reads and unexpected downloads are cancelled;
- screenshot is viewport-only and no caller output path exists;
- evidence is cursor-based, bounded, redacts URL credentials/query/fragment, and captures no request or response content;
- oversized output commits neither Artifact directory metadata nor SQLite metadata;
- all 15 public schemas are closed;
- Browser protocol and durable Browser ledger remain zero;
- the live fixture proves Artifact bytes, evidence redaction, bound enforcement, process zero, and Chromium orphan zero.

## Test owners

```text
tests/unit/browser-artifacts-step013b3.test.mjs
tests/unit/browser-artifact-boundaries-step013b3.test.mjs
tests/unit/workspace-file-tools-step008.test.mjs
scripts/run-step013b3-live.mjs
scripts/run_step013b3_acceptance.py
```
