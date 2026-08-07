# STEP010A Unit File Concurrency Was Undeclared

## Exact symptom

The same packaged STEP010A source passed the deterministic Linux source/fresh-ZIP suites but the real Windows aggregate unit run reported one failure among tests 1 through 69. The retained Windows log did not contain the failing assertion, so the failing product path is not claimed.

## Code-confirmed root cause

`scripts/run-step001-suite.mjs` invoked:

```text
node --test --test-reporter=tap <20 test files>
```

without declaring `--test-concurrency`. Node therefore owned cross-file scheduling. The suite includes real Host listeners, WebSocket handshakes, signal handling, child processes, SQLite contention and fixed bounded timing assertions. The execution order and simultaneous resource load were not part of the repository contract.

This omission is the confirmed deterministic-runner defect. It is not claimed, without the missing TAP block, that concurrency was the exact cause of the original failed assertion.

## Impact

- Test-file scheduling could vary by host and available processors.
- A Windows-only failure could not be reproduced under the same declared schedule elsewhere.
- Adding a pure test file could alter scheduling of unrelated process/socket tests.

## Fix

The canonical suite runner now declares:

```text
--test-concurrency=1
```

and publishes:

```text
OPENRILL_STEP001_SUITE_PASS unit_files=20 reporter=TAP concurrency=1
```

All unit files still run in one aggregate TAP invocation, but file workers are scheduled serially. Individual tests inside a file retain their explicit Node test semantics.

## Detailed evidence

- Before: no `--test-concurrency` argument.
- After: `UNIT_TEST_CONCURRENCY = 1` and `--test-concurrency=${UNIT_TEST_CONCURRENCY}`.
- Repaired aggregate suite: `117/117`, `fail 0`, `skipped 0`.
- STEP010A projection, spike and Skill live contracts are unchanged.

## Recurrence-prevention gate

`pnpm acceptance:step010a` and `pnpm acceptance:step010ar1` require:

```text
unit-suite-concurrency-one
unit-suite-concurrency-marker
recurrence:unit-suite-concurrency
```

Removal or alteration of the declared single-file-worker schedule fails acceptance.
