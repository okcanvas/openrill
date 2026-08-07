# OR-ISSUE-143 — Terminal child result could be lost across Host restart

## Symptom and code-confirmed cause

If a child Run became terminal after the last in-memory callback but before parent result delivery, startup did not reconcile the pending delivery.

## Correction

Startup scans terminal child Runs with active/pending delegation delivery and calls the idempotent completion path.

## Recurrence gate

`delegation-nested-recovery-step014c.test.mjs` and `delegation-nested-recovery-boundaries-step014c.test.mjs` retain the exact runtime or source boundary for this issue.
