# OR-ISSUE-375 — Overlapping acceptance cleanup invalidated an orphan canonical process

- Step: `STEP022CR3_WINDOWS_CMD_ENTRYPOINT_BYTE_CONTRACT_CLOSURE`
- Classification: validation execution concurrency / cleanup ownership
- Failure: an outer tool timeout returned while the STEP022C canonical child process remained alive. Starting a second aggregate then ran cleanup/build concurrently, deleting generated `dist/migrations` while the first canonical process was still reading it.
- Correction: acceptance aggregates are executed one at a time; after any outer timeout, process liveness is checked and the existing process is either awaited or terminated before a new cleanup/build starts. Overlapping acceptance runs are forbidden.
- Product impact: none; the earlier isolated canonical split run passed 185 files / 962 tests before the overlap.
