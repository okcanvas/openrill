# OR-ISSUE-409 — Broad Git EOL normalization would invalidate source-manifest byte identity

- Corrective: `STEP023AR1_GITHUB_PUBLISHING_SOURCE_HYGIENE_AND_EOL_CONTRACT_CLOSURE`
- Product: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`, version `0.25.0-step023a`, schema 26
- Classification: Git transport / package-manifest byte identity
- Failure found during Git staging validation: the first `.gitattributes` draft used repository-wide `text=auto`, LF rules for common text sources, and `*.cmd text eol=crlf`. Git immediately reported that historical LF `scripts/*.cmd` files would be converted to CRLF and a retained CRLF validation evidence text file would be converted to LF. Those checkout byte changes would disagree with `PACKAGE_MANIFEST.json`, whose contract hashes exact source bytes.
- Correction: default all tracked files to `-text` so Git preserves package bytes exactly, then opt in only the four root CMD entrypoints whose CRLF worktree bytes are an explicit STEP022CR3 contract.
- Product impact: none.
- Recurrence rule: `.gitattributes` must be derived from explicit byte contracts and package-manifest semantics. Never apply broad normalization to a repository whose source package verifies exact per-file hashes without first normalizing and re-owning every affected byte.
