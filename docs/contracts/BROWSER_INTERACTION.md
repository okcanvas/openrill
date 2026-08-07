# Browser interaction contract

## Actions

The provider-neutral `BrowserPageAction` union contains `click`, `type`, `press`, `select`, `fill`, `wait-time`, `wait-element`, and `wait-url`. Every adapter action is bounded by BrowserRuntime's action timeout.

## Ref resolution

Public refs are document-generation scoped. BrowserRuntime resolves a current public ref to an adapter-owned opaque `elementId` before action dispatch. Adapter IDs are never exposed to Tool callers.

A stale ref produces `BROWSER_STALE_REF` and may include a fresh `recoverySnapshot`. The failed action is not dispatched and is not automatically retried.

## Navigation

The context adapter must invoke `assertNavigationAllowed(url)` for every top-level navigation request before network dispatch. BrowserRuntime also validates the final page URL after action completion. A document-generation change causes the result to include fresh `pageState`.

## Dialogs

Modal dialogs are unsafe implicit control flow. The adapter safely dismisses the dialog, returns bounded observation state, and BrowserRuntime fails the action with `BROWSER_DIALOG_BLOCKED`. STEP013B2 has no public accept/respond operation.

## Tool schemas

There are 12 closed Browser Tool schemas. `browser.wait` accepts exactly one of duration, current ref, or exact URL. Text/value lengths, key lengths, value counts, URL lengths, and wait durations are bounded in Tool validation.
