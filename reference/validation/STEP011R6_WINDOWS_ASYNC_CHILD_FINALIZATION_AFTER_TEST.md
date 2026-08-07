# STEP011R6 Windows async child finalization after test completion

## Exact symptom

The real Windows command `pnpm acceptance:step011r6` passed the focused Proxy boundary test but failed the canonical suite with one file-level failure:

```text
# Subtest: tests\\unit\\process-approval-step009.test.mjs
not ok 17 - tests\\unit\\process-approval-step009.test.mjs
# tests 156
# pass 155
# fail 1
# skipped 0
```

The expected successful inventory was 155 tests. The additional file-path failure increased the total to 156 instead of replacing one of the 155 registered assertions.

## Code-confirmed root cause

Node's test runner emits an extra file-path failure when asynchronous activity throws after all registered tests in that file have completed. The R6 acceptance detail extractor began at the `# Subtest` line and discarded the immediately preceding `# Error: A resource generated asynchronous activity after the test ended...` diagnostic.

`process-approval-step009.test.mjs` starts background child processes. Its cleanup called:

```text
manager.close()
state.close()
rm(tempRoot)
```

R6 `ProcessManager.close()` only sent `child.kill()` and cleared the child map. It did not wait for the child's `close` event or output-stream completion. The registered background `close/error` callback subsequently executed a state transaction. On Windows, child termination can complete after the synchronous cleanup has already closed SQLite, creating asynchronous post-test activity.

This is the only callback path in the affected file that remains scheduled after `manager.close()`. A delayed-child fixture reproduces the ordering without relying on host speed.

## Impact

- all STEP009 assertions can pass while the test file process still exits with code 1;
- Windows child termination latency changes whether the callback runs before or after SQLite close;
- Host shutdown can close the durable state database before background process finalization;
- R6 failure reporting omitted the asynchronous-activity diagnostic immediately preceding the file-level TAP block.

## Fix

- make `ProcessManager.close()` asynchronous and idempotent;
- reject new process runs after close starts;
- track background child settlement through the child `close/error` event and output-stream completion;
- preserve an existing terminal durable status such as `CANCELLED` instead of overwriting it with `EXITED`;
- await active Agent Runs, then await `ProcessManager.close()`, then close SQLite;
- update STEP009 fixtures to await manager quiescence and use bounded Windows tree-removal retries;
- preserve a preceding TAP asynchronous-activity diagnostic in correction acceptance reports.

## Detailed evidence

- Windows R6 expected inventory: 155 tests.
- Windows R6 observed inventory: 156 tests, 155 pass, one extra file-path failure.
- R6 source: synchronous `close(): void`, `child.kill()`, immediate `children.clear()`.
- R6 test cleanup: manager close followed immediately by SQLite close and recursive removal.
- R7 delayed-child focused fixture: `close()` remains unsettled while the child delay is active, then resolves only after child close and stream finalization.
- R7 canonical serial suite: 159/159, 29 files, skipped zero.

## Recurrence-prevention gate

`pnpm acceptance:step011r7` requires:

```text
focused-process-close-tests
process-close-returns-promise
host-close-order
step009-cleanup-awaits-manager
async-tap-diagnostic-preserved
canonical-suite 159/159
```
