# OR-ISSUE-107 — download reserved filename collision

## Exact symptom

A downloaded file whose server-suggested filename was `source.json` would be represented in the Artifact file map under the same key used for Browser source metadata.

## Code-confirmed root cause

`recordDownload()` created one object containing both `[fileName]: bytes` and `"source.json": metadata`. JavaScript object-key uniqueness means a sanitized `source.json` payload key was overwritten by the later metadata key before any file write occurred. The inverse ordering would overwrite metadata instead.

## Impact

The Tool could report a successful download Artifact while the downloaded bytes were absent. A `metadata.json` suggestion also conflicted with the generic Artifact control file created after payload files.

## Fix

Filename sanitization treats `source.json` and `metadata.json` as reserved. They become `download-source.json` and `download-metadata.json` before the file map is created.

## Recurrence-prevention gates

- `browser-artifacts-step013b3.test.mjs` downloads a path-traversal form of `source.json` and verifies exact bytes in `download-source.json`;
- STEP013B3 acceptance statically verifies both reserved names;
- arbitrary caller output names and paths remain absent from the Tool schema.
