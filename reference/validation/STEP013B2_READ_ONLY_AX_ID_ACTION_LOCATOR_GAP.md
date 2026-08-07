# OR-ISSUE-099 — read-only accessibility identity lacked an actionable locator bridge

## Exact symptom

STEP013B1 could return role/name/ref observations, but its raw CDP accessibility node identity did not provide a supported Playwright Locator construction for STEP013B2 click/type/fill/select/wait actions.

## Code-confirmed root cause

The B1 adapter snapshot contract was sufficient for read-only observation. It exposed CDP accessibility-node-derived opaque IDs, but Playwright's public action APIs do not accept those IDs as locators. Letting BrowserRuntime or Tool code own raw Playwright objects would violate the accepted provider-neutral boundary.

## Impact

Naively adding actions would either be non-functional or leak Playwright page/locator ownership into BrowserRuntime/Tool packages, undoing STEP013A lifecycle isolation.

## Fix

The concrete adapter now uses Playwright's public AI accessibility snapshot, parses its `[ref=...]` values, exposes adapter-opaque IDs such as `aria:<ref>`, and resolves them only inside the adapter with `page.locator("aria-ref=<ref>")`. BrowserRuntime still maps opaque IDs to document-generation-scoped public refs.

## Recurrence-prevention gates

- browser-runtime has no Playwright/Puppeteer dependency;
- driver source must contain AI aria snapshot parsing and `aria-ref=` locator construction;
- public Tool output never contains adapter-owned `aria:` IDs;
- navigation invalidation and stale-ref tests remain mandatory.
