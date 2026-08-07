# OR-ISSUE-374 — Historical STEP022CR2 test froze the PowerShell wrapper implementation

- Step: `STEP022CR3_WINDOWS_CMD_ENTRYPOINT_BYTE_CONTRACT_CLOSURE`
- Classification: historical validation ownership / implementation detail
- Failure: STEP022CR2 correctly introduced a zero-argument root CMD entrypoint, but its retained test required that the CMD forever delegate to PowerShell. CR3 intentionally strengthens the CMD into a direct CRLF executable script.
- Correction: the historical test retains only its immutable ownership: root CMD exists, resolves from `%~dp0`, and accepts no external OpenRill root. CR3 owns the exact direct-command byte contract.
- Product impact: none.
