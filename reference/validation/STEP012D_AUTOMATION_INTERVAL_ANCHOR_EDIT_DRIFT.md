# STEP012D Automation interval anchor edit drift

## Issue

`OR-ISSUE-067 — AUTOMATION_UI_INTERVAL_ANCHOR_RESET_ON_UNRELATED_EDIT`

## Exact symptom / pre-fix reproduction

The first STEP012D editor implementation converted every save into a complete `automation.update` patch. For an interval schedule it constructed:

```text
{ kind: "interval", everyMs, anchorMs: Date.now() }
```

Therefore editing only the Automation name, prompt, title, failure policy, or enabled state also changed the interval anchor.

## Code-confirmed root cause

`apps/agent-web/src/browser-app.ts` owned form-to-protocol conversion. The conversion had no comparison against the selected job's current interval schedule and recreated `anchorMs` on every save.

## Affected path

```text
Automation edit form
→ automationInput()
→ full automation.update patch
→ new anchorMs
→ AutomationDefinitionService.update()
→ nextScheduledFor recomputed from a shifted anchor
```

## Impact

An unrelated configuration edit could silently move all future interval occurrences. This violates STEP012A's anchor-based no-drift schedule contract even though the scheduler and repository remain correct.

## Fix

When the selected job is an interval schedule and `everyMs` is unchanged, the UI reuses the existing `anchorMs`. A new anchor is created only for a newly created interval or an actual interval-period change.

## Automated recurrence-prevention gate

`tests/unit/automation-control-ui-step012d.test.mjs` verifies:

- unchanged interval duration selects `currentSchedule.anchorMs`;
- the previous unconditional `anchorMs: Date.now()` form is absent;
- the actual Windows fixture confirms the persisted interval remains 3,600,000 ms while unrelated edits advance revision without duplicate execution.
