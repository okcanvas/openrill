# OR-ISSUE-242 — Child Run and Flow link lacked one admission transaction

## Failure

After STEP020BR1, a caller could only create a Run through the Conversation boundary and link its Task through the Task Flow registry in separate transactions. A revision conflict or link failure after Run creation could leave an orphan durable Run/Task outside the intended Flow.

## Correction

`ConversationService.sendInTransaction()` is an internal composition point. `BoundTaskFlowControllerRuntime.runTask()` performs owner/controller/state/revision checks, Conversation submission, Run/Attempt/Task creation, Task classification, Flow link, Flow revision and `taskFlow.task.admitted` event in one State transaction. Scheduling occurs only after commit.

## Gate

`task-flow-controller-runtime-step020c.test.mjs` injects a SQLite trigger failure at Flow linking and proves message, Run, Task, submission and link all roll back.
