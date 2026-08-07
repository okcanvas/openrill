# STEP011R2 Browser Bootstrap Evidence Loss

## Symptom

Windows STEP011R2 reached actual Chromium but timed out waiting for the Vue UI connection:

```text
browser wait timeout: Vue UI connected; last=false
STEP011_CONTROL_UI_VERTICAL_SLICE checks=194/195 state=FAILED
STEP011R2_... checks=145/146 state=FAILED
```

The output did not contain the page exception, console error, failed resource, HTTP status, rendered connection state, or UI alert text.

## Code-confirmed root cause

`run-step011-live.mjs` launched Chromium with the final UI URL, waited for `DevToolsActivePort`, discovered the already-navigated page target, and only then connected CDP and enabled Runtime/Page/Log domains. Any Vue runtime, module import, CSP, bootstrap fetch, or WebSocket failure emitted during initial navigation occurred before listeners existed.

The wait helper retained only the last predicate result, which was `false`.

## Impact

A real browser boot failure could not be attributed without guessing. Repeated Windows reruns could move the failure without increasing evidence quality.

## Fix

- launch Chromium at `about:blank`
- attach CDP first
- register Runtime, console, Log, Network, and dialog listeners
- enable Runtime/Page/Log/Network before navigation
- navigate with `Page.navigate`
- retain bounded structured diagnostics and a safe DOM/resource snapshot

## Recurrence gate

STEP011R3 acceptance checks pre-navigation instrumentation ordering, stable evidence boundaries, and focused synthetic failures where the relevant exception precedes the timeout.
