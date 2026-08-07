# OR-ISSUE-145 — Joined delegation queries had ambiguous status ownership

## Symptom and code-confirmed cause

Terminal reconciliation joined `run_delegations` and `agent_runs` while selecting unqualified `status`, which is ambiguous in SQLite.

## Correction

Join queries use a dedicated fully qualified delegation select projection; runtime reopen/reconciliation tests exercise it.

## Recurrence gate

`delegation-nested-recovery-step014c.test.mjs` and `delegation-nested-recovery-boundaries-step014c.test.mjs` retain the exact runtime or source boundary for this issue.
