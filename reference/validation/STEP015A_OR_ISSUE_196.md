# OR-ISSUE-196 — Governance test froze the pre-run automation-duration placeholder

## Evidence

After the completed STEP015A aggregate measured `automated_run_seconds=63.695`, the time ledger was
updated from `NOT_RECORDED`. The focused governance test then failed because it still required:

```text
automated_run_seconds=NOT_RECORDED
```

The same ledger correctly retained `human_work_minutes=NOT_RECORDED`.

## Classification

`HARNESS / VALIDATION_LIFECYCLE_STATE_FREEZE`

## Root cause

The test confused two different fields:

- unknown human effort, which must remain `NOT_RECORDED`;
- measurable automated duration, which must transition to a numeric value after a completed run.

## Correction

The governance test now requires the human field to remain unknown and permits only a measured
numeric value for the completed automated run. The local validation document owns the exact marker.

## Product impact

None. This occurred after Product, focused, canonical, architecture, export, and manifest checks had
passed.
