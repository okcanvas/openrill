# OR-ISSUE-106 — legacy Artifact response shape widening

## Exact symptom

After extracting a generic internal Artifact writer for Browser binary Artifacts, an existing workspace file Tool regression failed because its output Artifact changed from:

```json
{"artifactId":"artifact-1","kind":"READ_OUTPUT"}
```

to an object that also exposed `sizeBytes`.

## Code-confirmed root cause

The new generic `record()` helper returned `{artifactId, kind, sizeBytes}` and the existing `recordRead`, `recordSearch`, and `recordChange` methods returned that internal object directly. `sizeBytes` was an implementation result needed by Browser Artifact methods, not part of the previously accepted workspace Tool response contract.

## Impact

A Browser-only storage extension silently widened unrelated public Tool outputs. Provider schemas, deterministic snapshots, and clients depending on exact result shapes could drift without any change to those Tools.

## Fix

Legacy methods explicitly project their original exact `{artifactId, kind}` shape. Browser screenshot/download methods separately construct their richer Artifact reference containing file name, media type, byte count, and hash.

## Recurrence-prevention gates

- `workspace-file-tools-step008.test.mjs` retains exact deep-equality assertions for legacy Tool results;
- STEP013B3 acceptance statically verifies explicit projection in all three legacy methods;
- Browser Artifact tests independently verify the richer Browser-specific shape.
