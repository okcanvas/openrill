# OR-ISSUE-149 — Operator cancellation risked a second cleanup implementation

## Symptom and code-confirmed cause

A Protocol-specific cancellation path could terminalize only the selected child and omit descendant Approval, Process, Browser or coordinator resources already owned by STEP014C.

## Correction

`delegation.cancel` delegates to the existing `subtreeCancellationOrder` and shared deepest-first resource cleanup/terminalization functions. Terminal replay is read-only.

## Recurrence gate

Source and SQLite runtime tests verify deepest-first reuse, terminal status, one event sequence and idempotent replay.
