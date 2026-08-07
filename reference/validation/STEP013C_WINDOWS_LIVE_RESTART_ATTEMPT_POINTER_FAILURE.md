# STEP013C Windows Live Restart Attempt Pointer Failure

## Observed Windows result

The user ran the packaged STEP013C candidate on Windows and reported:

```text
STEP013C_AUTOMATION_BROWSER_EXECUTION_DURABLE_LEDGER_AND_RESTART_RECOVERY checks=120/121 state=FAILED schema=11 baseline=STEP013B3 adapter=PLAYWRIGHT_CORE tools=15 automation_browser=AUTONOMOUS ledger=ACTION_EVIDENCE recovery=RESUME_AND_REOPEN reporter=TAP process_count=0 chromium_orphan=0
```

The only failed stage was `browser-live`. The second Host reclaimed the same Automation Run as attempt 2, but the Automation terminal row became:

```json
{"status":"FAILED","errorCode":"AUTOMATION_CONVERSATION_EXECUTION_FAILED","attempt":2}
```

Browser process cleanup still reported `process_count=0 chromium_orphan=0`.

## Code-confirmed root cause

`ConversationService.recoverIncompleteRuns()` changed the current RUNNING attempt to `ABORTED` and then cleared `agent_runs.current_attempt_id`.

`executeAgentRun()` performs these operations in order:

```text
conversations.executionContext(runId)
model adapter resolution
conversations.startExecution(...)
```

`executionContext()` rejects a Run with no `current_attempt_id`. Therefore the restart failed before `startExecution()` could execute its already-existing `ABORTED`-attempt rollover branch.

This is a direct contract contradiction:

```text
recovery cleared the identity
execution preflight required the identity
startExecution owned deterministic replacement of the ABORTED identity
```

## Correction

STEP013CR1 retains the old attempt ID on the recovered `CREATED/RESUMABLE` Run while marking that attempt `ABORTED/HOST_RESTART`.

`startExecution()` then creates attempt 2 and replaces `current_attempt_id` atomically. No old attempt is resumed or reused as RUNNING.

## Acceptance status

STEP013C is not accepted. The official accepted baseline remains STEP013B3 until STEP013CR1 passes the complete packaged Windows aggregate.
