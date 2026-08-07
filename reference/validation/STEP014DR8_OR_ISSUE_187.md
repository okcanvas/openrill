# OR-ISSUE-187 — Chromium launch failure could escape before lifecycle ownership transfer

## Symptom risk

STEP014DR8 added immediate failure for `Page.navigate.errorText`. That error can occur inside `launch()` before the function returns the Chromium child/CDP handle to the outer `browser` variable. The outer `finally` therefore cannot close a partially launched browser.

## Direct cause

Chromium lifecycle ownership transferred only on successful function return. Failures while waiting for DevTools, connecting CDP, enabling evidence domains or navigating had no local cleanup owner. This contradicted the DR7 lifecycle-closure rule.

## Correction

`launch()` now owns a guarded partial lifecycle. On any pre-return failure it closes CDP when present, terminates Chromium, waits for exit, uses Windows `taskkill /T /F` fallback, waits again, and then rethrows the original failure. If cleanup also fails, an `AggregateError` preserves both the launch and orphan evidence.

## Recurrence prevention

- resource ownership begins immediately after process spawn, not after helper return;
- every pre-return launch failure must run the same bounded Chromium close path as the outer `finally`;
- navigation errors remain immediate and typed without sacrificing process quiescence;
- source regression checks require guarded launch cleanup and post-`taskkill` exit confirmation.
