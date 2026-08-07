# STEP013B1A Windows live acceptance

## Source of evidence

The user supplied the following exact final marker from the packaged Windows run:

```text
STEP013B1A_WINDOWS_DETERMINISTIC_FOCUSED_TEST_REPORTER_ALIGNMENT checks=106/106 state=PASSED schema=9 baseline=STEP013AR4 retained_feature=STEP013B1 adapter=PLAYWRIGHT_CORE tools=READ_ONLY_6 refs=DOCUMENT_GENERATION_SCOPED stale_ref=BROWSER_STALE_REF reporter=TAP process_count=0 chromium_orphan=0
```

No per-check output beyond this marker is reconstructed or invented in this document.

## Accepted identity

```text
step=STEP013B1A_WINDOWS_DETERMINISTIC_FOCUSED_TEST_REPORTER_ALIGNMENT
version=0.13.6-step013b1a
schema=9
checks=106/106
state=WINDOWS_LIVE_ACCEPTED
zip_sha256=220009729163094365b1383fda1e059e2d9c5b69beb05f1476a162a608bd28ca
```

This acceptance proves the retained STEP013B1 concrete Playwright adapter, six closed read-only Browser Tools, document-generation-scoped refs, deterministic TAP reporting, and clean Browser shutdown with `process_count=0 chromium_orphan=0`.
