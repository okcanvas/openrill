# OR-ISSUE-232 — Resume preparation could use stale aborted Attempt provenance

## Observation

The Coordinator resolved Goal/Skill preparation before `executeAgentRun()` called `startExecution()`. A recovered Run still pointed at its aborted Attempt, so restart context mutations could be attributed to that stale Attempt even though execution later allocated the next Attempt.

## Direct cause

Attempt rollover and execution preparation were owned by different phases in the wrong order.

## Correction

- Add `ConversationService.prepareExecutionAttempt()`.
- For a `CREATED` Run whose current Attempt is `ABORTED`, allocate the next `CREATED` Attempt before any preparation callback.
- Append `run.attempt.prepared` with prior Attempt/recovery evidence.
- Use read-only Goal context for `WAITING_APPROVAL` resume so approval continuation does not increment Goal continuation state.

## Recurrence proof

Focused tests assert Attempt 2 exists before preparation and that `goal.continued.source_attempt_id` equals the second Attempt after Host restart.
