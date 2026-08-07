# STEP019A Windows Goal Live Attempt 1

## Result

```text
STEP019A_DURABLE_GOAL_PLAN_AND_LONG_RUNNING_TASK_STATE
checks=33/34
state=FAILED
version=0.19.0-step019a
schema=17
focused_product=4
canonical_files=117
canonical_tests=646
windows_goal_live=FAILED
promotion=BLOCKED
automated_run_seconds=136.328
```

Every source/package stage passed. The Windows live child executed all four STEP019A Product tests successfully and ended `9/10 FAILED` only at `check=schema detail=`.

## Direct evidence

```text
# tests 4
# pass 4
# fail 0
# skipped 0
OPENRILL_STEP019A_LIVE_FAILURE check=schema detail=
```

## Classification

Harness-only source-of-truth mismatch. Product Goal/Plan behavior, schema migration, SQLite persistence, Host restart context, blocker recurrence, completion proof, provenance, cleanup and canonical regression all passed.
