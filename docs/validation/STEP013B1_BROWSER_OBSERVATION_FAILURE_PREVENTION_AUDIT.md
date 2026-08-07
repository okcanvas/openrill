# STEP013B1 Browser Observation Failure Prevention Audit

## Boundary gates

- `browser-runtime` contains no Playwright dependency.
- `browser-playwright` owns exact `playwright-core 1.62.0`.
- Host creates the concrete adapter before widening to `BrowserDriver`.
- six Browser tools are registered; Browser protocol operations remain zero.
- schema remains 9 and migration 010 remains absent.

## Identity and observation gates

- Run ownership is exact across workspace/conversation/run/attempt.
- snapshots return bounded URL/title/text/elements/truncated data.
- same-document element identities retain refs.
- main-frame document navigation clears old mappings.
- old refs fail with `BROWSER_STALE_REF`.
- foreign owners receive not-found semantics.

## Launch and process gates

- executable resolution is explicit → PATH → limited system paths → fail closed.
- no browser installer or auto-download API exists.
- launch timeout reaches both BrowserRuntime and Playwright.
- abort observes and closes a late launch result.
- normal close and disconnect retire process ownership exactly once.
- live acceptance checks active adapter count and OS process marker orphan zero.

## Host gates

- executable preflight precedes profile lock acquisition.
- Run cancellation closes only matching Browser sessions.
- BrowserRuntime and ProcessManager drain before SQLite close.
- Browser disabled startup does not require `playwright-core` to be importable because the adapter loads it lazily at launch.

## Documented issues

```text
OR-ISSUE-090 provider-neutral metadata widening
OR-ISSUE-091 normal-close process retention
OR-ISSUE-092 late-launch abort orphan risk
```

Each issue has a detail file, Registry row, recurrence requirements, and automated static or live gate.
