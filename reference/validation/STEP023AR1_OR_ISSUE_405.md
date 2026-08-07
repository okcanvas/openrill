# OR-ISSUE-405 — Git transport did not own the Windows CMD CRLF byte contract

- Corrective: `STEP023AR1_GITHUB_PUBLISHING_SOURCE_HYGIENE_AND_EOL_CONTRACT_CLOSURE`
- Product: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`, version `0.25.0-step023a`, schema 26
- Classification: Git transport / Windows executable entrypoint byte contract
- Finding: STEP022CR3 proved the root CMD launchers must be non-empty ASCII with CRLF-only line endings, but the STEP023A tree had no root `.gitattributes`. A Git checkout could therefore depend on each machine's line-ending configuration instead of repository policy.
- Correction: add root `.gitattributes` with `*.cmd text eol=crlf` and explicit LF policies for PowerShell, shell, Python, JavaScript/TypeScript, JSON, YAML, Markdown and text sources.
- Product impact: none. No Product runtime implementation or state schema changes.
- Recurrence rule: any file with a byte-level executable contract must have a repository-owned Git attribute; ZIP byte verification alone is insufficient once Git becomes a distribution transport.
