# Workspace File Tool Contract

## Tool catalogue

STEP008 registers exactly six Model-visible Tools when a configured Workspace and Model provider are active:

```text
workspace.list
workspace.stat
workspace.read
workspace.search
workspace.write
workspace.patch
```

All Tool inputs are closed objects. The Run supplies `workspaceId`; the Model cannot select another Workspace through Tool arguments.

## Read tools

### workspace.list

Lists one directory in stable name order. Denied entries are omitted. Results carry root-relative references and may be truncated by entry count.

### workspace.stat

Returns kind, size, mtime, symlink traversal indication, and SHA-256 revision for bounded regular files.

### workspace.read

Reads valid UTF-8 regular files only. It enforces file, byte, line, and offset bounds. NUL-containing or invalid UTF-8 content returns `WORKSPACE_BINARY_FILE_DENIED`. When output is truncated, the complete content is stored as a private `READ_OUTPUT` Artifact.

### workspace.search

Performs literal, deterministic breadth-first search over visible regular UTF-8 files. It enforces file-count, scanned-byte, match-count, per-file-size, and line-preview bounds. Truncated result sets are stored as `SEARCH_OUTPUT` Artifacts.

## Mutation tools

### workspace.write

Creates or replaces one UTF-8 file. Required optimistic precondition:

```text
expectedRevision = MISSING | sha256:<64 hex>
```

Optional `expectedModifiedAtMs` adds a second precondition. The parent directory must already exist.

### workspace.patch

Applies one or more exact replacements to one existing UTF-8 file. Each replacement must match exactly once unless `replaceAll=true`, in which case at least one match is required. All replacements are computed before mutation; one conflict aborts the whole patch.

## Mutation safety

- same-file write/patch operations are serialized for the complete optimistic transaction;
- content is written to a same-directory unique temporary file;
- temporary content is fsynced;
- Workspace authority and expected revision are checked again;
- atomic rename replaces the target;
- original permissions are preserved where supported;
- temporary files are removed on failure;
- the parent directory is fsynced where portable.

A successful mutation returns a compact diff and records a private `FILE_CHANGE` Artifact containing before/after content when applicable and the diff.

## Artifact ledger

Artifact bytes live under the private profile state directory. Schema 5 stores only metadata in `workspace_artifacts`, bound by foreign keys to Run, RunAttempt, and Workspace registration.

Artifact kinds:

```text
READ_OUTPUT
SEARCH_OUTPUT
FILE_CHANGE
```

The Artifact store creates its own root and removes partial Artifact directories on failure.

## Stable errors

Expected policy and conflict failures are returned as Tool results with `isError=true` and a stable `WorkspaceError` code. Unexpected implementation failures cross the Tool Runtime boundary as `TOOL_EXECUTION_FAILED`.
