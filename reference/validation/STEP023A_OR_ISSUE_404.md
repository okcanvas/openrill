# OR-ISSUE-404 — Fresh-verifier governance guessed a nonexistent source token

- Step: `STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE`
- Classification: validation governance / source-token inference
- Failure: the new governance assertion required the literal text `cwd=extract`, while the verifier correctly passes the Fresh directory through `run_checked(command, extract)` and the helper owns `subprocess.run(..., cwd=cwd)`. The semantic boundary was implemented, but the test guessed a formatting/token shape that did not exist.
- Correction: governance checks the actual call `run_checked(command,extract)` together with the helper-owned subprocess cwd behavior rather than inventing an inline keyword form.
- Product impact: none. The verifier implementation was not weakened or rewritten to satisfy the guessed token.
- Recurrence rule: governance assertions follow actual source symbols/call structure and never demand a guessed formatting-specific spelling.
