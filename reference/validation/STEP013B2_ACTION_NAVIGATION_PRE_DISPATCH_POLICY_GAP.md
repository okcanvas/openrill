# OR-ISSUE-100 — action navigation pre-dispatch policy and diagnostic gap

## Exact symptom

A click or form action can initiate top-level navigation without the target URL appearing in the Tool input. A post-action final-URL check alone occurs after a network request may already have been dispatched. Playwright route abortion can also surface only a generic network error.

## Code-confirmed root cause

STEP013B1 navigation policy was centered on explicit `browser.navigate(url)`. Interaction actions had no requested URL at the provider-neutral Tool boundary, so the policy needed to be attached to the Browser context's request lifecycle rather than guessed from the action.

## Impact

A denied private/unsafe destination could receive a request before rejection, and the caller could lose the typed `BROWSER_NAVIGATION_BLOCKED` cause behind a Playwright network failure.

## Fix

BrowserRuntime supplies each context a provider-neutral `assertNavigationAllowed(url)` callback. The Playwright adapter intercepts only top-level navigation requests, calls the guard before `route.continue()`, aborts denied requests, and retains the original typed error per page. The action boundary consumes that error. BrowserRuntime still validates the final URL after action completion to cover redirects and adapter defects.

## Recurrence-prevention gates

- source-order gate requires guard before continue/abort;
- only top-level navigation requests are guarded by this route;
- live fixture attempts a denied action navigation and requires `BROWSER_NAVIGATION_BLOCKED`;
- final URL validation remains present after action completion.
