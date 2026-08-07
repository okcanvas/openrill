# STEP013B2 Browser interaction failure-prevention audit

This audit binds STEP013B2 to OR-ISSUE-098 through OR-ISSUE-104.

## Mandatory gates

- historical B1 tests and runners verify the retained six-tool prefix instead of freezing the total current inventory;
- BrowserRuntime remains free of Playwright/Puppeteer dependencies;
- concrete AI accessibility refs map to `aria-ref=` locators only inside browser-playwright;
- stale refs do not dispatch adapter actions and return a fresh recovery snapshot;
- top-level action navigation is guarded before `route.continue()` and denied before request dispatch;
- the original typed policy denial survives Playwright request abortion;
- final action URL is checked again after completion;
- action-triggered navigation returns fresh page state from the new generation;
- modal dialogs are safely dismissed and surfaced as `BROWSER_DIALOG_BLOCKED`;
- all 12 public schemas are closed;
- schema remains 9 and Browser protocol/ledger remain zero;
- live shutdown proves process and Chromium orphan counts zero;
- historical feature tests cannot freeze the mutable current release version;
- current accepted-baseline identity is loaded from one canonical record rather than duplicated in historical tests.
- every stage persists complete output and failed long TAP stages retain early failure anchors plus the full-log path.

## Test owners

```text
tests/unit/browser-interactions-step013b2.test.mjs
tests/unit/browser-interaction-boundaries-step013b2.test.mjs
tests/unit/acceptance-stage-evidence-step013b2.test.mjs
scripts/run-step013b2-live.mjs
scripts/run_step013b2_acceptance.py
```


## OR-ISSUE-104 — acceptance failure evidence truncation

The STEP013B2 aggregate persists complete stage logs under `.artifacts/acceptance/STEP013B2_STAGES/` and emits bounded failure excerpts that retain early TAP failure anchors. The synthetic focused fixture places a failure before more than 20 KB of later output and verifies byte-exact full-log persistence.
