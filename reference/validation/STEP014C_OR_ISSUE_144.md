# OR-ISSUE-144 — Recovered runnable child Run was not rescheduled

## Symptom and code-confirmed cause

A durable child Run left CREATED by Host death had no startup scheduling owner.

## Correction

Startup enumerates CREATED delegated Runs without active child waits and schedules them; waiting children remain paused.

## Recurrence gate

`delegation-nested-recovery-step014c.test.mjs` and `delegation-nested-recovery-boundaries-step014c.test.mjs` retain the exact runtime or source boundary for this issue.
