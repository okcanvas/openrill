# OR-ISSUE-250 — LOST reconcile retained a stale pre-repair Run snapshot

## First observation

After `MARK_RUNTIME_LOST` succeeded, the first reconcile result omitted same-pass retention scheduling.

## Direct cause

The loop refreshed the Task projection but continued evaluating retention against the Run snapshot captured before `markExecutionLost`. That stale Run still appeared active.

## Classification

Product maintenance ordering / post-repair read consistency.

## Correction

After LOST closure, reconcile reloads both Task and Run from State before evaluating any later decision. The same APPLY pass can safely append `task.lost` and `task.retention.scheduled`, and a repeated APPLY makes no changes.

## Recurrence gate

Focused acceptance asserts LOST count, Run FAILED/NON_RESUMABLE, Task LOST, both events, scheduled cleanup, and zero replay decisions.
