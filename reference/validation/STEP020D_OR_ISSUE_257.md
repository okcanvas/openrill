# OR-ISSUE-257 — Canonical Local Protocol notice wait timed out after an interrupted long run

## Observed sequence

1. A canonical invocation was externally terminated by the execution tool timeout while file 104 was starting. No Product assertion had failed.
2. A subsequent full canonical invocation reached `local-protocol-step004.test.mjs`; its notice replay test timed out and several WebSocket tests showed abnormal 16–29 second durations.
3. The same file immediately passed 8/8 in 1.189 seconds without source changes.
4. A clean standalone full canonical run then passed 141 files and 749/749 tests without source changes.

## Classification

Validation environment/timing incident. The exact external scheduling cause was not proven, so no Product root cause is claimed.

## Correction and acceptance rule

- No Product timeout or protocol code was changed to hide the incident.
- Partial or retried-file success is not accepted as canonical evidence.
- STEP020D acceptance requires a clean full canonical marker with zero failures and zero skips.
- The interrupted/failed logs remain diagnostic evidence; the final isolated full run is the acceptance evidence.

## Verified result

```text
OPENRILL_CANONICAL_BATCHES_PASS files=141 batches=9 tests=749 pass=749 fail=0 skipped=0
```
