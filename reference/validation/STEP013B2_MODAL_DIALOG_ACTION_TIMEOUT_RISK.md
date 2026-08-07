# OR-ISSUE-101 — modal dialog could strand an action until timeout

## Exact symptom

A page action that opens `alert`, `confirm`, `prompt`, or `beforeunload` can block Playwright progress. STEP013B1 had no dialog listener or public dialog state, so an interaction implementation without a dialog boundary could end only through the outer timeout.

## Code-confirmed root cause

Modal dialogs are page events that require a response. They are not represented by click/type return values. Without an adapter-owned observer and response policy, neither BrowserRuntime nor Tool code can safely resolve the blocked action.

## Impact

Actions could hang, diagnostics could report only timeout, and a modal could prevent all later Browser work. Automatically accepting dialogs would be an unsafe implicit user decision.

## Fix

The Playwright page wrapper observes dialogs, captures bounded id/type/message/defaultValue state, and safely dismisses them. The action returns the observation; BrowserRuntime emits `action.dialog_blocked` and returns `BROWSER_DIALOG_BLOCKED`. The action is never reported as success, and STEP013B2 exposes no accept/respond Tool.

## Recurrence-prevention gates

- adapter must call `dialog.dismiss()` and detach its listener on close;
- runtime must return typed dialog details and event;
- focused test requires blocked result rather than success;
- live fixture requires a later explicit action to succeed after dismissal.
