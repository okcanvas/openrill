# OR-ISSUE-114 — Restart Attempt Pointer Contract Mismatch

## Symptom

The real Windows STEP013C autonomous Browser recovery reached the second Automation attempt but failed with `AUTOMATION_CONVERSATION_EXECUTION_FAILED`.

## Root cause confirmed from code

`recoverIncompleteRuns()` marked the interrupted current attempt `ABORTED`, then assigned `currentAttemptId = null` to the recovered Run.

Before `startExecution()` can create a replacement attempt, `executeAgentRun()` calls `executionContext()`. That method requires a current attempt and throws `RUN_STATE_INVALID` when the pointer is null.

The existing `startExecution()` implementation already supports the correct transition:

```text
current attempt status=ABORTED
→ create next attempt number
→ set new current_attempt_id
→ start execution
```

Clearing the pointer prevented that owner from running.

## Correction

- retain the interrupted attempt ID on the recovered Run;
- keep the attempt terminalized as `ABORTED/HOST_RESTART`;
- allow `executionContext()` to reconstruct prior messages and durable usage;
- let `startExecution()` create attempt 2 and replace the pointer.

## Recurrence gates

- focused recovery test requires `CREATED/RESUMABLE` plus an attached `ABORTED/HOST_RESTART` attempt;
- the same test calls the real `executeAgentRun()` and requires completion with a different attempt ID and `attemptNumber=2`;
- static gate rejects recovery code that assigns `currentAttemptId = null`;
- Windows two-Host live acceptance still requires same Automation Run, same Agent Run, attempt 2, explicit Browser reopen, Artifact/evidence completion, and orphan zero.
