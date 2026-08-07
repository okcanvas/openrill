# OR-ISSUE-141 — Parent cancellation did not cascade descendant resources

## Symptom and code-confirmed cause

The previous Run cancel hook cancelled resources owned by the named Run only; nested child approvals, processes, Browser sessions and coordinator work could survive.

## Correction

Host enumerates active descendants deepest-first, cancels owned resources, terminalizes each child, then cancels the parent.

## Recurrence gate

`delegation-nested-recovery-step014c.test.mjs` and `delegation-nested-recovery-boundaries-step014c.test.mjs` retain the exact runtime or source boundary for this issue.
