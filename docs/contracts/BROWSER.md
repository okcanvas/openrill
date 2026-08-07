# Browser Contract

## Ownership

`@openrill/browser-runtime` owns the provider-neutral Browser process/context/page lifecycle, Run ownership, navigation/download policy, limits, document generations, public element refs, action orchestration, Artifact-store invocation, evidence access, cancellation, idle cleanup, crash invalidation, and shutdown quiescence.

`@openrill/browser-playwright` is the only package that binds `playwright-core`. It owns executable discovery, launch, ephemeral context/page wrappers, AI accessibility capture, internal locators/actions, request interception, dialog observation/safe dismiss, screenshot/download byte capture, bounded page evidence, event conversion, and process retirement. It does not write Artifact files or metadata. Tool code and Host composition do not own Playwright objects.

`@openrill/tools-files` owns workspace Artifact storage, safe names, content hashes, private file modes, total Artifact bounds, and metadata recording.

## Run owner

Every Browser session is owned by the exact tuple:

```text
workspaceId
conversationId
runId
attemptId
```

A Tool caller receives `BROWSER_SESSION_NOT_FOUND` instead of discovering another owner’s session or page identity.

## Provider-neutral page handle

```text
navigate(url, {signal, timeoutMs})
currentUrl()
title()
snapshot({signal, timeoutMs})
act(action, {signal, timeoutMs})
screenshot(format, {signal, timeoutMs, maxBytes})
download(elementId, {signal, timeoutMs, maxBytes})
evidence({afterSequence, limit})
close()
onPopup(listener)
onDownload(listener)
onMainFrameNavigated(listener)
```

The public snapshot contains:

```text
pageId
documentGeneration
url
title
text
elements[] { ref, role, name, interactive }
truncated
```

Text is bounded to 20,000 characters and accessibility elements to 500.

## Document generations and refs

The adapter advances its generation for each observed main-frame document navigation. BrowserRuntime synchronizes that value, clears prior element mappings, and resets the public ref sequence.

The adapter uses Playwright AI accessibility refs internally and exposes opaque IDs such as `aria:<ref>`. BrowserRuntime maps those IDs to:

```text
e<documentGeneration>-<sequence>
```

A stale public ref fails before action or download dispatch with `BROWSER_STALE_REF`. A fresh bounded `recoverySnapshot` is returned when possible. No heuristic rematching or automatic action retry is permitted.

## Public Tool surface

Fifteen closed Tools are registered when Browser is enabled:

```text
browser.status
browser.open
browser.list
browser.navigate
browser.snapshot
browser.close
browser.click
browser.type
browser.press
browser.select
browser.fill
browser.wait
browser.screenshot
browser.download
browser.evidence
```

Every input schema has `additionalProperties:false`. `browser.wait` accepts exactly one condition: bounded duration, current ref visibility, or exact URL. Screenshot/download accept no caller path or directory. No Browser protocol operation is added.

## Action navigation

Each Browser context receives `assertNavigationAllowed(url)`. The concrete adapter calls it for top-level navigation requests before network dispatch. A denied request is aborted and its original typed policy error is retained for the Tool boundary. BrowserRuntime also checks the final URL after action completion.

When an action changes main-frame generation, the successful result includes:

```text
navigated=true
pageState=<fresh snapshot from the new generation>
```

## Dialog policy

The fixed policy remains `BLOCK_AND_DISMISS`. The adapter captures bounded dialog state and safely dismisses the modal. BrowserRuntime returns `BROWSER_DIALOG_BLOCKED`; the action/download is not success. No accept/respond operation is exposed.

## Browser Artifacts

Screenshot is current viewport only and produces `BROWSER_SCREENSHOT`. Explicit ref-triggered download captures exactly one bounded stream and produces `BROWSER_DOWNLOAD`. BrowserRuntime validates ownership, current ref generation, final page URL, and download URL before Artifact storage.

Unexpected downloads are still cancelled. Suggested filenames are sanitized, bounded, and cannot collide with `source.json` or `metadata.json`. Browser payload defaults reserve 64 KiB beneath the generic 8 MiB Artifact envelope. Oversized output fails with `BROWSER_OUTPUT_TOO_LARGE` before metadata commit.

## Evidence

Each concrete page retains a 200-event ring containing bounded `console`, `page_error`, and `network` outcomes. `browser.evidence` returns at most 100 events by cursor. Network URL credentials/fragments are removed and queries become `?redacted`. Request headers/bodies, response bodies, cookies, and authentication content are not captured.

Evidence is live observation, not a durable Browser ledger.

## Executable resolution

Resolution order:

```text
explicit browser.executablePath
PATH: chromium, chromium-browser, google-chrome, google-chrome-stable, chrome, msedge
limited platform system paths for Chrome, Edge, or Chromium
otherwise fail startup clearly
```

The adapter never invokes a Playwright browser installer and does not download Chromium.

## Security and lifecycle

- contexts are ephemeral and accept downloads only for explicit Artifact capture;
- persistent storage is denied;
- unexpected downloads are cancelled;
- unexpected popups are closed;
- requested, action, final, and download URLs pass policy checks at their owning boundaries;
- actions, observations, evidence, and binary outputs are bounded;
- an aborted late Playwright launch is closed if it later resolves;
- normal close and disconnect retire process ownership exactly once;
- Host shutdown drains BrowserRuntime before SQLite close.

## Deferred

STEP013B3 does not expose evaluate, batch, coordinate click, hover, drag, scroll, resize, full-page/element screenshots, PDF, upload, arbitrary download paths, request/response body capture, persistent profile, existing-user Chrome attachment, durable Browser action/evidence ledger, or Automation-triggered Browser Runs.
