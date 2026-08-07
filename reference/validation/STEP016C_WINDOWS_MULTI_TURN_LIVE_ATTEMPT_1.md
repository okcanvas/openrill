# STEP016C Windows multi-turn live attempt 1

Observed on Windows from the packaged STEP016C candidate:

```text
STEP016C_LOCAL_MULTI_TURN_CONTINUATION_AND_RUNNING_HOST_ATTACHMENT
checks=82/83
state=FAILED
windows-multi-turn-live=TIMEOUT
stage_timeout_seconds=300
automated_run_seconds=440.407
termination=taskkill_rc=0,wait=exited
```

Every source/package stage passed before the live stage:

```text
source/version=PASS
workspace_lock=PASS
workspace_links=PASS
source_root=PASS
manifest_initial=PASS
workspace_build=PASS
focused_product=4/4 PASS
affected_regression=25/25 PASS
governance=57/57 PASS
canonical=99 files / 561/561 PASS
architecture=PASS
exports=PASS
manifest_final=PASS
```

The live stage log contained no terminal Product marker. Code inspection found a Harness lifecycle race after the successful `openrill stop` command: the fixture registered `host.child.once("close")` only after the stop command returned. When Windows had already delivered the child close event, the newly registered listener could never fire and the fixture waited until the outer 300-second timeout.

Classification: `HARNESS_FALSE_NEGATIVE` (`OR-ISSUE-213`).

Product version and State schema remain `0.16.3-step016c` and `15`.
