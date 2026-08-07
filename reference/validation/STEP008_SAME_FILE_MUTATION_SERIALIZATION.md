# STEP008 Same-File Mutation Serialization

## Issue

`OR-ISSUE-017`

## Exact symptom

Code audit of the first STEP008 implementation found that two concurrent `workspace.write` calls could both:

1. read the same expected revision;
2. write separate temporary files;
3. re-read the same current revision before either rename;
4. both rename successfully.

The last rename would win while both callers reported success. Atomic rename alone did not provide compare-and-swap semantics.

## Code-confirmed root cause

`atomicWriteWorkspaceText()` validated the revision twice but there was no same-file in-process mutation serialization around the full read/check/write/rename sequence. The OpenClaw reference also explicitly maintains a per-real-file mutation queue (`OC-FILE-003`), confirming that this is a separate concern from atomic replacement.

## Impact

Concurrent Agent runs in one Host process could lose one write without returning `WORKSPACE_REVISION_CONFLICT`.

## Fix

`withWorkspaceFileMutation()` now derives a realpath-based key when possible, serializes the complete write or patch operation per target file, permits independent files to proceed separately, and removes idle queue state.

## Recurrence-prevention gate

The STEP008 unit suite starts two writes to the same missing path with `expectedRevision=MISSING` and requires exactly one success, exactly one revision conflict, one final complete file, and one change Artifact.
