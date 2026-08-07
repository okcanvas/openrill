# STEP013A Host shutdown test turn assumption

## Issue

```text
OR-ISSUE-080
STEP013A_HOST_SHUTDOWN_TEST_TURN_ASSUMPTION
```

## Actual focused-test failure

The first Host shutdown-drain test called `host.close()`, waited two generic event-loop turns, and then invoked a callback expected to have been assigned by `BrowserDriver.dispose()`. On one run the callback was still undefined:

```text
TypeError: disposeRelease is not a function
```

## Root cause

The test inferred that shutdown had reached Browser disposal from elapsed turns. Host shutdown first closes protocol/server/coordinator actors, so event-loop turns are not a valid synchronization contract.

## Impact

The validation could fail or pass depending on machine scheduling while testing correct product behavior.

## Fix

The fake driver now exposes an explicit `disposeStarted` barrier. The test waits for that event, confirms Host close is still pending, releases disposal, and then requires Host close to resolve.

## Recurrence gate

No fixed sleep or generic event-loop turn may be used to infer Browser disposal entry. The test must synchronize on an explicit driver-owned start barrier and completion barrier.
