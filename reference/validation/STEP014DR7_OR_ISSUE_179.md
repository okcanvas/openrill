# OR-ISSUE-179 — Historical UI entrypoint gate froze the fetch implementation

## Symptom

After replacing global `fetch()` with the bounded loopback client, the retained STEP014DR5 unit test failed even though the served index still determined the canonical module entrypoint and the exact module URL was still requested.

## Root cause

The historical gate required the literal expression `controlUiModuleEntrypointFromHtml(await indexResponse.text())`, conflating the invariant with one transport API.

## Correction

The gate accepts either a native Response body or the bounded client's already-consumed `text` field while still requiring served-index discovery, canonical URL construction, and no `/assets/app.js` compatibility path.

## Recurrence gate

Historical tests own the entrypoint-discovery invariant, not the mutable response-consumption syntax.
