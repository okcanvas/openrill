# Browser Artifacts and evidence contract

## Ownership

`@openrill/browser-playwright` captures provider-neutral bytes and observations only. It does not create directories, choose Artifact identities, write files, or record SQLite metadata.

`@openrill/browser-runtime` owns policy, bounds, Run ownership, current page/ref validation, Artifact-store invocation, error mapping, and runtime events.

`@openrill/tools-files` owns private Artifact directories, sanitized file names, content hashes, metadata, and the total Artifact envelope.

## Screenshot

`browser.screenshot` accepts only:

```text
sessionId
pageId
format? = png | jpeg
```

The adapter captures the current viewport with animations disabled, caret hidden, CSS scale, and `fullPage:false`. It returns bytes only if the main-frame document generation remains unchanged. BrowserRuntime validates the final URL and persists one `BROWSER_SCREENSHOT` Artifact.

The caller cannot choose an output path, directory, element, or full-page mode.

## Download

`browser.download` accepts only:

```text
sessionId
pageId
ref
```

BrowserRuntime resolves the current document-scoped ref before dispatch. A stale ref returns `BROWSER_STALE_REF` plus a fresh recovery snapshot and the click is not replayed.

The adapter claims exactly one Playwright download from the explicit click. It validates the download URL before opening the stream and aborts if the bounded byte limit is exceeded. Any download not associated with this explicit capture is cancelled by BrowserRuntime.

The suggested filename is reduced to a basename, normalized, stripped to a restricted character set, and bounded. `source.json` and `metadata.json` are reserved and become `download-source.json` and `download-metadata.json` so payload bytes cannot overwrite Artifact control files.

## Artifact envelope

The generic workspace Artifact limit remains 8 MiB. Browser payload defaults reserve 64 KiB for `source.json` and `metadata.json`:

```text
maxScreenshotBytes = 8 MiB - 64 KiB
maxDownloadBytes   = 8 MiB - 64 KiB
maxPageTitleChars  = 4,096
```

The title bound is applied in the concrete adapter before `title()`, snapshot, or screenshot metadata crosses the provider-neutral boundary.

An adapter payload overflow becomes `BROWSER_OUTPUT_TOO_LARGE`. Artifact creation is atomic at the directory level: any file or metadata failure removes the incomplete directory and commits no metadata row.

## Evidence

`browser.evidence` accepts:

```text
sessionId
pageId
afterSequence? >= 0
limit? = 1..100
```

The adapter retains at most 200 page events. The public result is cursor-based:

```text
pageId
nextSequence
truncated
events[]
```

Supported events are:

```text
console    level, text, optional bounded location
page_error name?, message, stack?
network    method, URL, resourceType, status?, ok, failureText?
```

Console text and network failure text are bounded to 2,000 characters, stacks to 8,000, URLs to 4,096, and public batches to the configured evidence limit.

Network URL userinfo and fragments are removed. Any query is replaced with `?redacted`. Request headers, request bodies, response headers, response bodies, cookies, and authentication material are not collected.

## Persistence boundary

Screenshot and download are workspace Artifacts and use migration 010 Artifact kinds. Evidence remains a bounded live page observation and does not create a protocol operation, Browser ledger, or schema table.
