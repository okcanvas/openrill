# Browser Automation and Recovery Contract

## Scope

This contract begins at STEP013C and composes the accepted Browser Tool surface with the Automation scheduler and Agent Run ledger. It does not turn Browser Tools into protocol operations.

## Durable operation identity

Every Browser Tool invocation receives one operation ID and records:

```text
runId
automationRunId? 
attemptId
workspaceId
conversationId
toolCallId?
toolName
inputSha256
sessionId?
pageId?
```

Raw Tool input is never stored by the Browser operation ledger. `(runId,toolCallId)` is unique when `toolCallId` is present. Reuse with a different Tool name or hash is a state conflict.

## Operation lifecycle

```text
STARTED → SUCCEEDED
STARTED → FAILED
STARTED → INTERRUPTED  (Host restart only)
```

Terminal metadata may contain a typed error code, document generation, persistence-redacted URL, and Artifact ID. Operation events are append-only.

## Completed-Tool checkpoint

After an actual Tool result or deterministic replay result is durably appended to the conversation, Agent Kernel appends:

```text
run.checkpoint
kind=tool.completed | tool.replayed
toolCallId
name
isError
```

The idempotency key is Tool-call scoped. A failed Tool result is still a completed Tool boundary and may be a safe restart checkpoint because its result is durable and must not be re-executed implicitly.

## Safe restart window

A running Agent Run is resumable after the latest completed-Tool checkpoint only when subsequent durable events are limited to `model.requested` and `model.retry`. Partial provider output after the checkpoint is not safe.

Any still-STARTED model invocation is terminalized as `FAILED/MODEL_INTERRUPTED_BY_RESTART`. The old attempt is ABORTED and the Run is reset to `CREATED/RESUMABLE` with no current attempt.

## Automation lease recovery

An expired RUNNING Automation Run is requeued only if its linked Agent Run is `RESUMABLE` and `CREATED` or `WAITING_APPROVAL`. The existing Automation Run ID and Agent Run ID are retained.

The production Automation executor detects an existing `runId`, emits `automation.run.resuming`, and calls `executeUntilTerminal(runId)` without creating a second conversation, submission, or binding.

## Browser process loss

Browser session/page/ref identity is process-local. Restart recovery never reconstructs or aliases the old identity. A Tool using the old session fails `BROWSER_SESSION_NOT_FOUND`. The model must issue an explicit new `browser.open` and use the returned identity.

## Evidence persistence

The Browser Tool response may contain bounded evidence. The dedicated durable evidence table stores:

- event kind, sequence, time;
- console level plus text SHA-256/length;
- page-error message/stack SHA-256/length;
- network method, persistence-redacted URL, resource type, success flag, and failure-text SHA-256/length.

This table does not duplicate arbitrary console/page-error text. The persistence boundary independently removes URL credentials and fragments and replaces any query with `?redacted`.

## Shutdown

Graceful Host shutdown drains Automation scheduler/coordinator, Browser Runtime, and concrete adapter. Forced process death is recovered from SQLite on the next startup. Final live acceptance requires no marker process and no Chromium orphan.

## Restart attempt-pointer invariant (STEP013CR1)

For a recoverable interrupted RUNNING Agent Run:

```text
old attempt → ABORTED/HOST_RESTART
agent_runs.current_attempt_id → remains old attempt during recovery preflight
executeAgentRun.executionContext → may reconstruct durable context
startExecution → creates the next attempt and atomically replaces current_attempt_id
```

Recovery must not clear the pointer before execution preflight. The retained pointer does not authorize the old attempt to run again; its ABORTED status is the signal that `startExecution()` must create the next attempt.

Typed Conversation recovery failures crossing the Automation executor use `AUTOMATION_CONVERSATION_<CODE>`. Live failure diagnostics are metadata-only and must not persist or print prompts, raw Tool input, Browser evidence text, request/response content, credentials, cookies, or raw URLs.

## SQLite row assertion boundary (STEP013CR2)

Live recovery verification treats query rows as value carriers. It validates the required fields and never requires an ordinary JavaScript object prototype. This is an acceptance-fixture representation boundary only; durable recovery state and repository behavior are unchanged.
