# STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE

```text
STEP=STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE
VERSION=0.21.3-step021br2
STATE_SCHEMA=24
PARENT=STEP021BR1_PLAN_REVISION_STABLE_STEP_IDENTITY_AND_OPEN_BLOCKER_GUARD_CLOSURE
OFFICIAL_PRODUCT_BASELINE=STEP021A_DURABLE_GOAL_PLAN_TO_TASK_FLOW_EXECUTOR_FOUNDATION
PROMOTION=WINDOWS_TAP_SUMMARY_LIVE_PENDING
```

## Why this corrective exists

Actual Windows STEP021BR1 evidence proved all 22 focused Product tests passed, while the live Harness failed four TAP summary checks with `-1`. The Product correction was valid; promotion was blocked by a JavaScript string-escape defect in the evidence parser.

## Closed boundary

1. Node TAP summary parsing is a shared line parser, not a dynamically constructed numeric regular expression.
2. LF, Windows CRLF, and lone CR input are accepted deterministically.
3. Missing values remain explicit negative sentinels and cannot become false passes.
4. The historical STEP021BR1 live Harness is repaired to use the same parser.
5. The current Windows Harness runs the retained 22 Product tests plus four parser regression tests and validates 28 independent checks.
6. No Product, protocol, state schema, Goal executor, Task Flow, retry, blocker, or Host lifecycle source changes are introduced by STEP021BR2.

## Windows command

```powershell
pnpm install --frozen-lockfile
pnpm acceptance:step021br2:live
```

Expected focused marker:

```text
STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE checks=28/28 state=PASSED version=0.21.3-step021br2 schema=24 tap_summary=LINE_BASED_INTEGER line_endings=LF_CRLF numeric_escape=REGEXP_STRING_REMOVED ... live_harness=STEP021BR2_H1_WINDOWS_TAP_SUMMARY_PARSER_AND_PLAN_REVISION_RESTART
```
