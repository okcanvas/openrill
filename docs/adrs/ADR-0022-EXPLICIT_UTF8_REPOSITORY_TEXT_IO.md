# ADR-0022 — Explicit UTF-8 Repository Text IO

- Status: Accepted
- Date: 2026-08-01
- Step: STEP006A

## Context

OpenRill repository text is UTF-8 and includes Korean reference evidence. Windows Python 3.12 selected cp949 for `Path.read_text()` when encoding was omitted. STEP006 acceptance therefore failed before product validation while reading `EVIDENCE_INDEX.json` at UTF-8 byte `0xed`, position 73.

Child-process output had already been made locale-independent in STEP001C, but repository file IO had no repository-wide enforcement.

## Decision

- Repository text files are UTF-8.
- Python `Path.read_text` and `Path.write_text` calls must specify an encoding explicitly.
- Active Python scripts are scanned through the AST; implicit text IO is an acceptance failure.
- Repository source parsing uses strict UTF-8. It does not use replacement decoding.
- Controlled child-process diagnostic output may continue using binary capture followed by UTF-8 replacement decoding.
- Binary files use byte APIs.

## Consequences

- Windows ACP, system locale and console code page cannot change repository parsing behavior.
- Korean and other non-ASCII evidence remains stable across Windows and Unix.
- New Python scripts cannot silently reintroduce locale-dependent text reads or writes.
- Call sites are slightly more explicit, which is intentional for build and acceptance infrastructure.
