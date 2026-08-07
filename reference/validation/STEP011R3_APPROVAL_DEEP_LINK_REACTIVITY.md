# STEP011R3 approval deep-link reactivity

## Exact symptom

The real browser flow changes the hash from `#/approvals` to `#/approvals/<requestId>` and waits for the matching approval article to receive the `selected` class. Code audit showed that this same-route hash transition was not guaranteed to trigger that update.

## Code-confirmed root cause

`approvalDeepLink` was a Vue computed value that read `location.hash` through `approvalRequestFromLocation()` but had no reactive dependency. The `hashchange` handler only assigned `route.value = "approvals"`; when the route was already `approvals`, Vue could suppress the unchanged ref assignment and the computed value remained cached.

## Impact

The UI could connect, render approvals, and still time out on the approval deep-link selection step even though `location.hash` had changed correctly.

## Fix

Introduce a reactive `routeHash` ref, update it on every `hashchange`, and make `approvalDeepLink` depend on `routeHash.value`. Route selection remains separately derived from the same location.

## Detailed evidence

The code path was deterministic:

```text
current route = approvals
location.hash = #/approvals/<id>
hashchange -> route.value = approvals (same value)
approvalDeepLink computed has no tracked dependency
selected class may remain stale
```

The revised source explicitly records `routeHash.value = location.hash` before recomputing the route.

## Recurrence-prevention gate

STEP011R4 acceptance requires the reactive hash owner, a computed deep-link dependency on that owner, and the actual Chromium approval deep-link selection step.
