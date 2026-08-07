# STEP020C OpenClaw Bound Controller Runtime and Task Admission Audit

## Source inputs

- OpenClaw `2026.7.2`, ZIP SHA-256 `1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82`.
- OpenRill accepted STEP020BR1 ZIP SHA-256 `5ed9f739ce3244c4f3c0ff583fdc05dcecdf11d0dfe1d9db69c77de4b28fa747`.

## OpenClaw source inspected

- `src/plugins/runtime/runtime-taskflow.ts`: session-bound Task Flow runtime and managed lifecycle entry points.
- `src/tasks/task-executor.ts`: Flow validation before child Task creation and execution.
- `src/tasks/task-flow-owner-access.ts`: owner-key access enforcement.
- `src/tasks/task-flow-registry.ts` and SQLite store: durable Flow identity and revision updates.
- retained Task Flow tests covering owner, cancellation and execution admission.

## Confirmed gap after STEP020BR1

STEP020BR1 correctly closed Conversation ownership and cancellation admission, but its production Host still exposed only registry-oriented operations. There was no controller-bound entry point that created a child Run and its Run-linked Task, linked that Task to the Flow, advanced Flow revision/event state, and scheduled execution as one coherent admission operation.

Calling `ConversationService.send()` and `TaskFlowService.linkTask()` as separate commits would permit an orphan Run/Task when Flow linking or revision-CAS failed after Run creation. OpenClaw's executor boundary confirms that owner/cancel/terminal checks must happen before child creation and that execution admission belongs to the bound controller runtime rather than to a generic registry caller.

## OpenRill mapping

- OpenClaw session owner key maps to the durable OpenRill Conversation ID already established by STEP020BR1.
- `controllerId` is enforced by a bound runtime, not stored as passive metadata only.
- `createManaged(requestKey)` derives deterministic Flow identity and detects conflicting replay.
- `runTask(requestKey)` derives a deterministic Conversation submission key.
- Message, Run, Attempt, Submission, Background Task classification, Flow Task link, Flow revision and append-only event are committed inside one SQLite transaction.
- The Run coordinator is invoked only after commit. Exact replay reuses durable identity; terminal Run replay is never rescheduled.
- Autonomous Plan-to-Task traversal is not implied by this runtime and remains deferred.
