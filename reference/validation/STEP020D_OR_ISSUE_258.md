# OR-ISSUE-258 — Synchronous tool call terminated acceptance parent and orphaned canonical child

## First observation

The first STEP020D integrated acceptance invocation reached the canonical stage and emitted its 15-second heartbeat. The external conversation execution wrapper then timed out the synchronous tool call, terminating the Python acceptance parent while the Node canonical child continued under PID 1.

## Classification

Execution-tool wrapper / validation process ownership. This was not a Product or acceptance-stage assertion failure.

## Correction

- The orphan canonical process was explicitly terminated before another acceptance run.
- The complete acceptance command was launched as one detached OS process with stdout/stderr redirected to a durable log.
- Completion was accepted only after that same process exited and wrote the final aggregate marker.
- No individual stage result from the orphaned attempt was reused as final evidence.

## Verified corrected result

```text
STEP020D_TASK_AND_TASK_FLOW_RECONCILIATION_LOST_AND_RETENTION_FOUNDATION checks=50/50 state=PASSED ... focused_product=8 affected_regression=91 governance=150 canonical_files=141 canonical_tests=749 ... automated_run_seconds=58.739
```

This procedure does not change the Windows command. On Windows the user runs `pnpm acceptance:step020d:live` normally in the terminal.
