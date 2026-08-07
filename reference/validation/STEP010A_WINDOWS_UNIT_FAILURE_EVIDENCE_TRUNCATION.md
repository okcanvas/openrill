# STEP010A Windows Unit Failure Evidence Truncation

## Exact symptom

The real Windows command

```cmd
pnpm acceptance:step010a
```

completed every STEP010A static/spike/live/cleanup check except `build-unit-architecture-exports`. The embedded TAP summary was:

```text
# tests 117
# pass 116
# fail 1
# skipped 0
STEP010A_CONTROL_UI_FRAMEWORK_SELECTION checks=251/252 state=FAILED
```

The retained detail began in the middle of test 70. The failed subtest, assertion, stack and source line from tests 1 through 69 were absent.

## Code-confirmed root cause

`scripts/run_step010a_acceptance.py` selected failure detail with:

```python
suite_output[-10000:]
```

The unit suite output exceeded 10,000 characters. Therefore a failure located before the retained tail was deterministically discarded. The supplied log cannot prove which subtest failed, so this document makes no product-code root-cause claim for that missing assertion.

## Impact

- The original Windows failure could not be assigned to a concrete test or source line.
- A repair based on the missing assertion would have required guessing and is prohibited by the project constitution.
- Repeated Windows runs could fail without retaining the evidence required to close an Engineering Issue.

## Fix

`extract_tap_failure()` now locates the first TAP `not ok` record, includes its preceding `# Subtest` line, YAML diagnostic block and final TAP counters, independent of where the failure occurs in the output.

The STEP010A acceptance uses that extracted block whenever the full suite predicate fails. A synthetic failure placed more than 12,000 characters before the summary verifies that the failing block is still retained.

## Detailed evidence

- Real Windows result: `117 tests`, `116 pass`, `1 fail`, `0 skipped`.
- Retained log begins at test 70, proving the fixed tail omitted earlier output.
- Source before repair: `suite_output[-10000:]`.
- Source after repair: `extract_tap_failure(suite_output)`.
- The extractor is tested with an early failure followed by more than 12,000 filler characters.

## Recurrence-prevention gate

`pnpm acceptance:step010a` and `pnpm acceptance:step010ar1` require:

```text
tap-failure-position-independent
recurrence:tap-failure-evidence
```

A suite failure must report `OPENRILL_TAP_FAILURE_BEGIN`, the actual `not ok` block, `OPENRILL_TAP_FAILURE_END`, and TAP counters.
