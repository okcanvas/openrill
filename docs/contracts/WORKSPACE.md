# Workspace Contract

## Scope

A Workspace is an explicitly configured local directory that grants an Agent run a bounded filesystem authority. It is not a shell working directory and it is not an arbitrary host path.

## Registration

Configuration input:

```yaml
workspaces:
  - id: main
    path: D:\work\project
    readOnly: false
```

At Host startup OpenRill resolves and validates every root before accepting conversations. A registration contains:

```text
workspaceId
private configuredPath
private canonicalRoot
public displayName
accessMode = READ_ONLY | READ_WRITE
trustState = CONFIGURED_LOCAL
rootRevision = SHA-256(canonicalRoot)
```

Duplicate IDs and roots resolving to the same canonical directory are rejected.

## Public reference

Protocol, Model context, Tool result, RunEvent, and Artifact metadata exposed to the Agent use only:

```text
workspaceId + root-relative portable path
```

The canonical host root is private state and is never a Tool input or public file reference.

## Path grammar

- non-empty relative UTF-8 string, except `.` may identify the root for list/search/stat;
- `/` and `\` normalize to `/`;
- absolute POSIX, UNC, drive-qualified, and rooted Windows paths are rejected;
- `..`, device names, ADS colon, control characters, trailing dot/space, and non-portable characters are rejected;
- `.git`, `.hg`, `.svn`, `node_modules`, `.openrill`, and secret-like path segments are denied.

## Confinement

For an existing path OpenRill resolves the real target and requires it to remain under the canonical root. For a missing write target it resolves the nearest existing ancestor. Symlink, junction, or reparse-point traversal outside the root fails with `WORKSPACE_SYMLINK_ESCAPE`.

Write authority is revalidated before temporary-file creation and before replacement. Missing parent directories are not created implicitly.

## Access modes

- `READ_ONLY`: list/stat/read/search only.
- `READ_WRITE`: list/stat/read/search/write/patch.

A write request against a read-only Workspace fails before mutation.

## Durable state

Schema 5 stores registration identity in `workspace_registrations`. Full file content is not copied into SQLite.
