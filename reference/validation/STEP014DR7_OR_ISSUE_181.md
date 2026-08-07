# OR-ISSUE-181 — Multi-file canonical batches retained cross-file open-handle coupling

## Symptom

The first bounded canonical implementation completed two batches but a later batch stopped after passing subtests without returning its TAP summary. Running the same files independently completed.

## Root cause

A batch still passed multiple test files to one `node --test` child. That reduced the monolithic inventory size but retained shared process globals and open handles across files. A delayed handle from one file could therefore prevent the entire group from completing and hide which file owned the leak.

## Correction

Batching now owns only ordering and progress aggregation. Each sorted unit file runs in a separate Node child with a file-specific timeout, cleared `NODE_TEST_CONTEXT`, exact TAP parsing and a file start/end marker. Timeout or malformed completion identifies the exact repository-relative file.

The bounded loopback HTTP client also waits for request closure before returning timeout or oversized-body errors, and its regression verifies that the test server has zero open sockets after each failure.

## Recurrence gate

STEP014DR7 boundaries require per-file child execution and `OPENRILL_CANONICAL_FILE_START/END` evidence. The loopback regression requires socket quiescence after timeout and oversize failures.
