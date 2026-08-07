# OR-ISSUE-358 — Windows Live check count changed depending on the failure point

## Observed problem

The first Live harness appended one catch-only failure check, so early and late exceptions produced different totals and could not satisfy an exact marker contract.

## Correction

The harness owns a fixed list of 25 live checks, fills every unvisited check as failed, and always emits one overall vertical check, yielding exactly 56 checks.

## Recurrence gate

`tests/unit/validation-governance-step022c.test.mjs` and the relevant STEP022C focused or Windows Live path retain this boundary.
