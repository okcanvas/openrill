# STEP011R3 implicit favicon HTTP failure

## Exact symptom

The structured Chromium evidence included:

```text
network.http status=404 url=<LOOPBACK>/favicon.ico
log.error Failed to load resource: 404
```

The STEP011 live runner treats any retained browser runtime/network diagnostic as a failure after the vertical slice completes.

## Code-confirmed root cause

`apps/agent-web/public/index.html` did not declare an icon. Chromium therefore requested `/favicon.ico` implicitly. The loopback static server only serves declared packaged assets and correctly returned 404.

## Impact

After the Vue mount failure was repaired, the otherwise harmless implicit request would still leave a diagnostic entry and fail the final browser acceptance.

## Fix

Add a packaged same-origin SVG favicon and declare it explicitly:

```html
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
```

No fallback route or broad static-file exception was added.

## Detailed evidence

The browser evidence listed every expected application resource with successful timing and separately recorded `/favicon.ico` as the only HTTP 404. Source inspection confirmed there was no `<link rel="icon">` element and no favicon asset.

## Recurrence-prevention gate

Acceptance verifies that the HTML declares `/assets/favicon.svg`, the file exists in the packaged public tree, and the actual Chromium evidence contains no favicon 404.
