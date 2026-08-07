# ADR-0024 — Workspace-Relative File Authority

## Status

Accepted in `STEP008_WORKSPACE_AND_FILE_TOOLS`.

## Context

The Agent Kernel needs useful local file access, but arbitrary absolute paths would let a Model select host resources outside user-declared authority. Atomic rename alone also does not prevent two concurrent optimistic writes from both reporting success.

## Decision

1. Users explicitly register canonical Workspace roots in configuration.
2. Model-visible Tools receive only root-relative portable paths; workspace identity comes from the Run.
3. Existing targets and nearest existing ancestors are realpath-confined to the registered root.
4. Read/search are bounded and binary/secret/ignored paths fail closed.
5. Write/patch require optimistic revisions, same-file mutation serialization, same-directory atomic replacement, and private change Artifacts.
6. SQLite stores registration and Artifact metadata, not a mirror of Workspace files.

## Consequences

- A Model cannot request an arbitrary host path.
- Symlink/junction escapes are rejected at point of use.
- Concurrent same-file mutations produce one winner and a revision conflict instead of silent lost update.
- Creating directories and Shell execution remain outside STEP008.
- Cross-process writers that do not use OpenRill are detected by the final revision check when observable before rename; filesystem-native compare-and-swap is not claimed.
