# STEP013B3 Browser Artifacts and bounded evidence

## Identity

```text
STEP013B3_BROWSER_ARTIFACTS_AND_BOUNDED_EVIDENCE
version=0.13.8-step013b3
schema=10
baseline=STEP013B2_BROWSER_INTERACTIONS_NAVIGATION_STATE_AND_DIALOG_BLOCKER
baseline_checks=134/134
baseline_zip_sha256=e67068f8285096118111be357c953b58c6a050bc2e082158b0bfa78dbf7494aa
```

## Goal

Add bounded Browser output to the accepted run-owned Browser lifecycle without allowing Playwright objects, arbitrary output paths, unbounded binary payloads, request content, or Browser-specific persistence to escape their ownership boundaries.

## Product changes

- three additional closed Tools: `browser.screenshot`, `browser.download`, `browser.evidence`;
- viewport-only PNG/JPEG screenshot capture persisted as a workspace Artifact;
- ref-triggered capture of exactly one bounded download persisted as a workspace Artifact;
- bounded cursor-based console, page-error, and network-outcome evidence;
- network evidence strips URL credentials and fragments and replaces queries with `?redacted`;
- request headers, bodies, response bodies, cookies, and arbitrary caller output paths are not captured;
- Artifact kinds `BROWSER_SCREENSHOT` and `BROWSER_DOWNLOAD`;
- migration 010 rebuilds `workspace_artifacts` while preserving all prior rows;
- state schema advances from 9 to 10;
- Host creates one workspace Artifact store and injects it into both file Tools and BrowserRuntime.

## Security decisions

- screenshot is current viewport only; no full-page or element screenshot;
- download is initiated only by a current document-scoped ref;
- no arbitrary file path or directory input;
- unexpected downloads remain cancelled;
- download URL policy is checked before bytes are read;
- screenshot/download payloads are bounded below the total Artifact envelope;
- oversized output fails before Artifact metadata is committed;
- evidence is a bounded in-memory page ring and is not a durable Browser ledger;
- stale download refs return recovery state and never auto-click a fresh element.

## Acceptance flow

```text
Host start
-> schema 10 migration with prior Artifact preservation
-> concrete Playwright adapter launch
-> run-owned session/page and workspace Artifact store
-> deterministic local fixture
-> browser.screenshot -> PNG Artifact and signature check
-> browser.download -> exact fixture bytes and metadata check
-> oversized browser.download -> BROWSER_OUTPUT_TOO_LARGE and no metadata commit
-> browser.evidence -> console/page_error/network
-> query secret absent and network URL contains ?redacted
-> evidence cursor returns no duplicate events
-> browser.close and Host shutdown
-> process_count=0 chromium_orphan=0
```

## Deferred

PDF, upload, full-page/element screenshots, arbitrary download paths, request/response content capture, durable Browser evidence/action ledger, Automation-triggered Browser Runs, and crash/restart recovery remain deferred.
