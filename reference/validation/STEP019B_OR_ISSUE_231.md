# OR-ISSUE-231 — Recovered root Runs were classified but never scheduled

## Observation

`ConversationService.recoverIncompleteRuns()` could correctly convert a checkpointed `RUNNING` root Run to `CREATED/RESUMABLE`, but Host startup discarded the classifications. Startup scheduled only delegated child Runs and reconciled parents.

## Direct cause

There was no repository/service query for durable `CREATED` Runs and no root-Run startup scheduling pass.

## Correction

- Add deterministic `listCreatedRuns()` and `ConversationService.runnableRunIds()`.
- At Host startup schedule each `CREATED` root Run.
- Exclude delegated children and parents with an active delegation wait; those remain owned by Delegation recovery.
- The same scan closes a crash window between durable `conversation.send` commit and in-memory scheduling.

## Recurrence proof

`tests/unit/detached-host-resume-step019b.test.mjs` sends through the authenticated protocol, disconnects the client, restarts the Host, and observes automatic completion without a second execute/send request.
