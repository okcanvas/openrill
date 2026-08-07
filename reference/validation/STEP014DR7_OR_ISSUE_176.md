# OR-ISSUE-176 — Unconsumed Control UI module response triggered Node undici assertion

## Symptom

Windows STEP014DR6 passed 264/265. `deterministic-nested-control-ui-live` failed inside `node:internal/deps/undici` with `assert(!this.paused)`.

## Root cause

The fixture fetched `/assets/web/browser-app.js`, checked only HTTP status, and did not consume or cancel the response body before cleanup. The paused response reached socket end during lifecycle teardown.

## Correction

The module request uses `getLoopbackText`, which buffers the complete bounded response before Chromium launch or Host cleanup.

## Recurrence gate

- direct `fetch()` is forbidden in audited loopback live fixtures;
- the deterministic module request must read `module.text`;
- helper tests cover chunked, length-delimited, oversized, timeout and invalid-response cases.
