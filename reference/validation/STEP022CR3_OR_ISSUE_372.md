# OR-ISSUE-372 — Windows CMD entrypoint content was not byte-verified

- Step: `STEP022CR3_WINDOWS_CMD_ENTRYPOINT_BYTE_CONTRACT_CLOSURE`
- Classification: Windows packaging / executable entrypoint byte contract
- Failure: STEP022CR2 accepted the presence and decoded text of root `.cmd` wrappers, but did not require Windows CRLF bytes, a nontrivial minimum byte size, direct command execution, or post-ZIP re-open verification. A user then observed `start-and-run-step022c-live.cmd` as empty after extraction.
- Correction: root `.cmd` entrypoints are generated as ASCII with CRLF, the primary command directly runs frozen install and the integrated Mattermost live command, and both acceptance and packaging reopen/read exact bytes and fail on zero length, bare LF, missing commands, or external-root arguments.
- Product impact: none; STEP022C runtime identity remains `0.24.0-step022c`, schema 25.
- Promotion: real Windows Mattermost live remains pending.
