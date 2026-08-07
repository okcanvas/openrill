# OR-ISSUE-104 — acceptance stage failure evidence truncation

## Exact symptom

A final STEP013B2 aggregate run reported:

```text
canonical suite: tests=290 pass=289 fail=1
STEP013B2 ... checks=124/126 state=FAILED
```

The emitted `OPENRILL_STEP013B2_FAILURE check=canonical-suite` block began around subtest 244 and contained only later successful subtests. The actual earlier `not ok` test name, diagnostic block, and stack were absent. A subsequent complete isolated run passed 290/290, so the missing original failure could not be identified without guessing.

## Code-confirmed root cause

`run_step013b2_acceptance.py` retained only `output[-20000:]` in the check detail and then printed only `detail[-10000:]`. Long TAP output therefore received two independent tail truncations. Any failure occurring before the retained tail was permanently removed from the report, even though `acceptance_stage_runner.run_stage()` had captured the complete child output.

## Impact

- an actual aggregate failure could not be assigned a code-confirmed root cause;
- transient and deterministic failures could not be distinguished from retained evidence;
- another conversation receiving only the ZIP and acceptance output could not continue safely;
- the project’s no-guess and permanent issue-record rules were violated by the acceptance evidence path itself.

The underlying 289/290 event did not reproduce and is not assigned a speculative product cause. This issue covers only the proven evidence-loss defect.

## Fix

- every STEP013B2 external stage now writes its complete UTF-8 output to `.artifacts/acceptance/STEP013B2_STAGES/<stage>.log`;
- the aggregate prints the exact stage-log path and byte count;
- failed checks use a bounded diagnostic extractor that retains every TAP `not ok`, nonzero `# fail`, assertion/error marker, and OpenRill failure marker plus the output tail;
- the acceptance report stores that bounded diagnostic and references the complete stage log;
- the final failure printer no longer applies a second tail truncation.

## Recurrence-prevention gates

- `tests/unit/acceptance-stage-evidence-step013b2.test.mjs` verifies full-output persistence and rejects the previous double-tail patterns;
- a synthetic output places `not ok` near the beginning and more than 20 KB of successful output afterward;
- the complete persisted log must remain byte-identical to the synthetic output;
- the bounded excerpt must still contain the early test name, exact cause, nonzero fail count, and full-log path;
- STEP013B2 acceptance runs this fixture as an explicit focused stage and validates the static ownership contract.
