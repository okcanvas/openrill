# OR-ISSUE-235 — Mandatory TaskService injection broke retained Automation executor callers

## Observation

The first affected Automation regression did not invoke the coordinator and failed its expected execution count; a dependent test was then cancelled.

## Direct cause

STEP020A initially made the new `tasks` constructor option mandatory in `AutomationConversationExecutor`. Retained tests and compatible internal callers that exercised the pre-STEP020A constructor shape did not provide it, so execution failed before the existing Automation path.

## Correction

- Keep `tasks?: TaskService` optional at the executor API boundary.
- The production Host lifecycle always injects the real `TaskService`.
- When present, the executor reclassifies the already-created Run Task as `AUTOMATION`; it never creates a second Task.
- Retain the historical Automation protocol regression and add a focused STEP020A classification/no-duplicate test.

## Recurrence proof

`tests/unit/automation-protocol-step012c.test.mjs` and `tests/unit/background-task-automation-step020a.test.mjs` run together and must both pass.
