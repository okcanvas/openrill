# OR-ISSUE-092 — STEP013B1 late Playwright launch after abort orphan risk

## Pre-acceptance code-review symptom

BrowserRuntime can abort a launch because of its bounded launch timeout or Host cancellation. A simple `Promise.race` rejects immediately, but `playwright.chromium.launch()` is not guaranteed to settle at the same instant. The first draft could lose ownership of a Browser object that resolved after the abort path had already returned.

## Code-confirmed root cause

The adapter raced the launch Promise against `AbortSignal` without attaching cleanup to the still-running launch Promise. Cancellation of the waiting caller is not cancellation of the underlying Playwright launch operation.

## Impact

A late successful launch could leave a Chromium process outside BrowserRuntime and driver ownership, making `orphan=0` unprovable and potentially leaking a process after a failed Host startup or timed-out session.

## Fix

Before entering the abort race, the adapter creates `closeLateLaunch`. When abort wins, it attaches to the original launch Promise and closes any Browser that resolves later. A second post-race `signal.aborted` guard closes the Browser if launch and abort settle at the boundary.

## Recurrence-prevention gates

- static test requires cleanup attached to the original launch Promise;
- static test requires `withAbort(launched, signal, closeLateLaunch)`;
- adapter process count must return to zero in the live vertical slice;
- process-table marker scan must report Chromium orphan zero;
- launch timeout remains owned by BrowserRuntime and Playwright receives the same bounded timeout.
