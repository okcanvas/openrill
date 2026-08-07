# STEP020C Bound Task Flow Controller Runtime and Atomic Child Task Admission

## Goal

Turn the accepted Task Flow registry foundation into an executable controller boundary without introducing a second scheduler or autonomous Plan executor.

## Product scope

1. Add a Conversation-bound and controller-bound runtime factory.
2. Add deterministic, retry-safe `createManaged` Flow creation.
3. Add `runTask` child admission with one transaction for Conversation message, Run, Attempt, Submission, Run-linked Task, Task classification, Flow link, Flow revision and Flow event.
4. Reject admission before writes for owner/controller mismatch, stale revision, terminal Flow, cancellation request, WAITING and BLOCKED.
5. Preserve exact request replay and reject conflicting replay.
6. Schedule only after the durable transaction commits through the existing Run coordinator.
7. Do not reschedule terminal Runs during exact replay.
8. Expose closed Host operations `taskFlow.create`, `taskFlow.run`, `taskFlow.wait`, `taskFlow.resume`, `taskFlow.finish`, and `taskFlow.fail` in addition to retained list/get/cancel.
9. Prove actual Host execution, restart identity, terminal replay and child cancellation cascade.

## Explicit non-scope

- automatic conversion of Goal Plan Steps into Task Flow children;
- autonomous Plan-to-Task next-step selection;
- completion notification and requester delivery;
- LOST reconciliation, audit repair and retention;
- distributed workers;
- external model, browser live and real connector validation.

## Acceptance shape

- focused runtime, protocol and Host tests;
- retained STEP020BR1 owner/admission tests;
- retained Task/Run restart and cancellation tests;
- full governance and canonical suite;
- separate Windows scripted-local Harness before Product promotion.
