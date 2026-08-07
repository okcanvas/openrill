# STEP020E Windows Completion LIVE Failure

```text
step=STEP020E_DURABLE_TASK_COMPLETION_DELIVERY_CONTROLLER_WAKE_AND_REQUIRED_COMPLETION_SEMANTICS
version=0.20.5-step020e
schema=22
aggregate=49/50 FAILED
focused=9/10
windows_completion_live=FAILED
live_harness=STEP020E_H1_DURABLE_COMPLETION_DELIVERY_CONTROLLER_WAKE_RESTART_AND_SEMANTICS
promotion=BLOCKED
automated_run_seconds=211.827
observed_at=2026-08-06 KST
```

## Exact failing boundary

The first eight completion-delivery scenarios and schema migration scenario passed. The only failing test was:

```text
STEP020E Host restart resumes the same queued controller wake Run after a durable Tool checkpoint
error=local protocol connection failed
code=PROTOCOL_CONNECT_FAILED
location=tests/unit/task-completion-host-step020e.test.mjs:170
```

The failure occurred when the test started the second Host, awaited `host.ready`, read the new private metadata, and immediately called `LocalCliProtocolClient.connect()`.

## Code inspection result

`startLocalHost()` does not report READY before the HTTP listener is bound and READY metadata is persisted. Linux rerun of the exact three Host scenarios passed. The remaining product gap was in `LocalCliProtocolClient.connect()`: a retryable TCP/WebSocket transport failure was finalized after one attempt even though the API exposes a caller-owned overall connect timeout and the real `openConversationSession()` uses this same client.

## Acceptance consequence

STEP020E was not promoted. STEP020D remained the Product baseline. The correction is owned by STEP020ER1 and must preserve all STEP020E semantics while adding bounded transport-only connection retry.
