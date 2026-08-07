# OR-ISSUE-401 — Orphan-process preflight matched its own shell command text

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: validation process ownership / false-positive preflight
- Failure: an ad-hoc orphan guard searched the full `ps` command text for acceptance script names. Because those literal names were embedded in the current `bash -lc` command itself, the guard falsely reported the current shell as an orphan and blocked the official aggregate before it started.
- Correction: process ownership checks must compare tokenized process arguments for an exact script argument and exclude the current process ancestry; free-text substring matching of the invoking shell command is forbidden.
- Product impact: none. The official STEP023A aggregate did not start during the false-positive attempt, so no Product state or build output was concurrently modified.
- Recurrence rule: orphan detection is based on exact argv identity, not substring search over shell command text.
