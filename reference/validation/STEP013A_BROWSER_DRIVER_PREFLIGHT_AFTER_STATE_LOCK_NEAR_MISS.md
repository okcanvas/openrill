# STEP013A Browser driver preflight after state lock near-miss

## Issue

```text
OR-ISSUE-078
STEP013A_BROWSER_DRIVER_PREFLIGHT_AFTER_STATE_LOCK_NEAR_MISS
```

## Pre-packaging code-level symptom

The first STEP013A Host composition draft checked `browser.enabled && !browserDriver` only after profile lock acquisition and SQLite/workspace initialization. Throwing at that point bypassed the startup block that owned State close and lock release.

## Root cause

A new dependency precondition was inserted near BrowserRuntime construction instead of the existing pre-lock Host argument-validation boundary.

## Impact

A configuration error could leave a profile lock or SQLite handle retained even though Host startup failed before listening. A second start could then be rejected as already running.

## Fix

The Browser driver requirement is now checked immediately after bind/port validation and before `acquireHostLock()`. BrowserRuntime construction no longer owns the missing-driver branch.

## Recurrence gate

- static source ordering requires the missing-driver preflight before `acquireHostLock`;
- focused Host test enables Browser without a driver and expects immediate `HOST_STARTUP_FAILED`;
- the test uses a unique profile and verifies no runtime initialization is required;
- no public Browser Tool or DB migration is introduced by this correction.
