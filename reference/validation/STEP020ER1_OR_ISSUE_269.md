# OR-ISSUE-269 — Windows restart Local Protocol connection refusal was terminal after one attempt

## Symptom

The actual Windows STEP020E LIVE run passed 9/10 focused tests but failed the Host-restart continuation scenario with `PROTOCOL_CONNECT_FAILED` immediately after the second Host reported READY.

## Exact cause

`LocalCliProtocolClient.connect(timeoutMs)` created exactly one WebSocket attempt. The error was marked `retryable=true`, but no caller or client loop retried it. This was not test-only: `openConversationSession()` uses the same one-shot client. A short Windows restart transport refusal therefore consumed the entire product operation as a terminal failure even though the caller supplied a bounded overall connection window.

## Correction

- `connect(timeoutMs)` now owns an overall deadline.
- Only pre-accept transport failures `PROTOCOL_CONNECT_FAILED` and `PROTOCOL_CONNECTION_CLOSED` are retried.
- Backoff is bounded at 25, 50, 100, then 200 milliseconds.
- Timeout remains caller-owned and returns `PROTOCOL_CONNECT_TIMEOUT`.
- Authentication rejection, invalid frame, remote bind denial, and Host identity mismatch are not retried.
- Failed sockets cannot clear or overwrite a later successful socket.

## Permanent evidence

- `tests/unit/local-cli-protocol-retry-step020er1.test.mjs`
- `tests/unit/task-completion-host-step020e.test.mjs`
- `tests/unit/validation-governance-step020er1.test.mjs`
- Windows Harness `STEP020ER1_H1_WINDOWS_LOCAL_PROTOCOL_RESTART_CONNECT_RETRY_AND_COMPLETION`
