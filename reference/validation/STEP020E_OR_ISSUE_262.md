# OR-ISSUE-262 — Host BLOCKED test flattened the Task Flow link projection

## First observation

The progress-only Host scenario timed out although the delivery and `task_flow.get` call were correct.

## Direct cause

The fixture searched `get.output.tasks[].terminalOutcome`; the public view is a link projection and the Task is nested at `get.output.tasks[].task`.

## Correction

The controller fixture now reads the actual nested projection and uses its Task ID and terminal summary for `task_flow.block`. The isolated and complete focused suites pass.

## Product impact

None. This was a validation-fixture shape error, not a Product runtime failure.
