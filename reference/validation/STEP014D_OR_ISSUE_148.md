# OR-ISSUE-148 — Raw delegation repository/event data could cross the control boundary

## Symptom and code-confirmed cause

Repository rows include internal task SHA and delegation events include payload JSON. Returning those rows directly from Protocol would expose execution-internal data and make the UI depend on storage schema.

## Correction

`DelegationService` creates a dedicated bounded public view. Event payload is removed, history is capped at 100, and terminal output reuses the existing bounded result projection.

## Recurrence gate

Runtime and source tests assert absence of `taskSha256`, transcript, reasoning and payload fields and validate bounds.
