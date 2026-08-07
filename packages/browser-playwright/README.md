# @openrill/browser-playwright

STEP013B2 concrete Chromium adapter for `@openrill/browser-runtime`.

It owns only exact `playwright-core 1.62.0` binding, restricted executable discovery, ephemeral Browser/context/page wrappers, Playwright AI accessibility snapshot parsing, internal `aria-ref=` locator construction, click/type/press/select/fill/wait execution, pre-dispatch top-level navigation interception, modal-dialog observation/safe dismiss, main-frame generation observation, disconnect handling, late-launch cleanup, and process retirement.

It never owns Run/session/page/public-ref identity or Tool registration. Adapter IDs such as `aria:<ref>` remain opaque outside this package.

Browser binaries are not downloaded. Resolution order is explicit `browser.executablePath`, PATH candidates, then a limited platform system-path set. Failure is closed and names the exact executable or `playwright-core` prerequisite.
