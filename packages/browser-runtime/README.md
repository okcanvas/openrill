# @openrill/browser-runtime

STEP013B2 retains the provider-neutral Browser lifecycle and read-only observation foundation, then adds bounded interaction orchestration.

The runtime owns Run-scoped session/page identity, navigation policy, limits, single-flight launch, popup/download denial, dialog policy, crash invalidation, idle cleanup, cancellation, document generations, public element refs, stale-ref recovery snapshots, action result synchronization, and shutdown quiescence.

Public refs remain stable only inside one main-frame document. A stale ref is never heuristically rematched or automatically replayed; it fails with `BROWSER_STALE_REF` and a fresh bounded `recoverySnapshot` when available.

Twelve closed tools are available through `registerBrowserTools`:

```text
browser.status browser.open browser.list browser.navigate browser.snapshot browser.close
browser.click browser.type browser.press browser.select browser.fill browser.wait
```

Action-triggered navigation returns a fresh `pageState`. Modal dialogs are safely dismissed by the concrete adapter and surfaced here as `BROWSER_DIALOG_BLOCKED`.

This package contains no Playwright dependency. Concrete locator/action/dialog binding remains owned by `@openrill/browser-playwright`. Artifacts, console/network evidence, Browser protocol operations, durable Browser ledgers, and Automation-triggered Browser Runs remain deferred.
