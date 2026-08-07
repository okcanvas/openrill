# OR-ISSUE-091 — STEP013B1 Playwright process retention after normal close

## Pre-acceptance code-review symptom

The first adapter draft added every launched `PlaywrightProcessHandle` to `PlaywrightBrowserDriver.#processes`. Normal `process.close()` detached the browser `disconnected` listener before calling `browser.close()`. Because set removal existed only in the disconnected callback, a normally closed process remained retained in the driver set.

## Code-confirmed root cause

Driver ownership retirement was tied to one external event path instead of the handle lifecycle. Detaching the event handler for safe close also removed the only path that deleted the handle from the ownership set.

## Impact

- `activeProcessCount` could remain non-zero after a successful Browser session close;
- later `driver.dispose()` could attempt a second close on an already closed browser;
- a long-running Host could retain stale handle objects even when Chromium had exited;
- orphan/quiescence evidence would not accurately describe adapter ownership.

## Fix

`PlaywrightProcessHandle` now owns an idempotent `#retire()` transition supplied with a driver deletion callback. Both browser disconnect and the `finally` block of normal close call `#retire()`. The adapter exposes a read-only `activeProcessCount` diagnostic used by the live acceptance gate.

## Recurrence-prevention gates

- static test requires the idempotent retirement method;
- normal close must retire in `finally`;
- disconnect must also retire;
- live vertical slice requires `activeProcessCount=0` before completion;
- Host shutdown still calls BrowserRuntime close before SQLite close.
