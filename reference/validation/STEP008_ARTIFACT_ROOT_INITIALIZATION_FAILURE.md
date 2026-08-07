# STEP008 Artifact Root Initialization Failure

## Issue

`OR-ISSUE-014`

## Exact symptom

The first direct STEP008 Tool test run produced five failures. Bounded read, write, patch, and search all surfaced:

```text
ToolRuntimeError: tool execution failed: workspace.read
ToolRuntimeError: tool execution failed: workspace.write
ToolRuntimeError: tool execution failed: workspace.patch
ToolRuntimeError: tool execution failed: workspace.search
```

The non-Artifact path tests passed.

## Code-confirmed root cause

`createWorkspaceArtifactStore()` attempted:

```text
mkdir(<artifact-root>/<artifact-id>, recursive=false)
```

without first creating `<artifact-root>`. The Host happened to own the state directory but did not own the nested `workspace-artifacts` directory. Every Tool that needed an Artifact therefore failed with `ENOENT` before metadata could be recorded.

## Impact

- A truncated read/search failed instead of returning bounded output.
- Successful write/patch filesystem mutations could be followed by an Artifact failure, turning the Tool call into an error after the file had changed.
- The storage component depended on undocumented caller initialization order.

## Fix

The Artifact store now:

1. creates its own root with `recursive=true` and private mode;
2. creates each immutable Artifact directory with `recursive=false`;
3. removes a partially written Artifact directory when content, metadata, size validation, or metadata sink recording fails.

## Recurrence-prevention gate

The STEP008 unit suite starts with no Artifact root and requires truncated read, bounded search, write, and patch to create valid private Artifact files. Acceptance checks the root-creation and partial-cleanup code paths.
