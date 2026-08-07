# STEP021BR1 Windows TAP summary parser failure

```text
OBSERVED_AT=2026-08-06 KST
FAILED_STEP=STEP021BR1_PLAN_REVISION_STABLE_STEP_IDENTITY_AND_OPEN_BLOCKER_GUARD_CLOSURE
FAILED_VERSION=0.21.2-step021br1
FAILED_SCHEMA=24
AGGREGATE=67/68 FAILED
INNER_HARNESS=20/24 FAILED
FOCUSED_NODE_TESTS=22/22 PASSED
PRODUCT_FAILURE=NONE
PROMOTION=BLOCKED
```

## Actual Windows evidence

The Windows run completed all 22 focused Product tests successfully, including the changed-Step Host restart scenario, but the live Harness emitted four failed checks:

```text
OPENRILL_STEP021BR1_LIVE_FAILURE check=focused-tests detail=-1
OPENRILL_STEP021BR1_LIVE_FAILURE check=focused-pass detail=-1
OPENRILL_STEP021BR1_LIVE_FAILURE check=focused-fail detail=-1
OPENRILL_STEP021BR1_LIVE_FAILURE check=focused-skipped detail=-1
```

The same output contained the valid TAP summary:

```text
1..22
# tests 22
# pass 22
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

The aggregate therefore correctly retained STEP021A as the accepted Product baseline and blocked promotion.

## Code-level root cause

`run-step021br1-plan-revision-corrective-live.mjs` constructed a regular expression from a JavaScript template string:

```js
new RegExp(`^# ${name} (\d+)$`, "gm")
```

In the runtime string, the single JavaScript escape is consumed and the effective expression becomes `(d+)`, not `(\d+)`. Numeric TAP summary values can never match, so every parsed count becomes `-1` even when the focused process exits successfully.

This is an acceptance-Harness defect only. No Goal, Plan revision, blocker, retry, Task, Flow, Run, Host recovery, protocol, schema, or Product source failed in the Windows evidence.
