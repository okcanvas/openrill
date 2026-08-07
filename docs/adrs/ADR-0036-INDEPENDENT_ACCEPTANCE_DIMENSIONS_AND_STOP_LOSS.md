# ADR-0036 — Independent Acceptance Dimensions and Stop-Loss

## Status

Accepted in STEP015A.

## Context

STEP014 proved delegation runtime behavior while repeated browser, transport, fixture, and
cleanup failures kept the full aggregate red. Product progress became coupled to acceptance
machinery.

## Decision

Report Product Core, Required Integration, Optional UI, Harness, and Package independently.
Apply one bounded correction per failure class; same-class recurrence stops Product-versioned
corrective suffixes and forces ownership redesign or backlog separation.

Browser automation is required only for browser-owned Product changes or claims unavailable
below that boundary.

## Consequences

Known UI and Harness defects remain visible without blocking unrelated Product work. No result is
silently upgraded to PASS, but evidence from successful dimensions is retained.
