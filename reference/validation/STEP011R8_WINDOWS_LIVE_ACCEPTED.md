# STEP011R8 Windows Live Accepted

## Exact Windows result

```text
STEP011R8_APPROVAL_CREATION_NOTICE_AND_UI_LIST_REFRESH checks=198/198 state=PASSED schema=7 approval_notice=CREATION_PUBLISHED ui_refresh=DOMAIN_NOTICE process_close=ASYNC child_quiescence=AWAITED transport=SHALLOW_REF projection=PROXY_SAFE approval_ttl=120000 process_timeout=5000 vue=RUNTIME_ONLY csp=NO_UNSAFE_EVAL browser=CHROMIUM
```

## Baseline promotion

```text
previous_official_baseline=STEP010AR1 121/121 WINDOWS_LIVE_ACCEPTED
new_official_baseline=STEP011R8 198/198 WINDOWS_LIVE_ACCEPTED
feature_closed=STEP011_CONTROL_UI_VERTICAL_SLICE
```

## Proven on actual Windows Chromium

- exact Vue 3.5.40 runtime-only global build
- strict CSP without `unsafe-eval`
- app-shell mount and authenticated Local Protocol connection
- explicit favicon and clean browser diagnostics
- same-route approval deep-link reactivity
- approval TTL 120000 ms independent from process timeout 5000 ms
- Proxy-safe projection boundary
- async ProcessManager close with awaited Windows child quiescence
- creation-time `approval.updated`
- UI `approval.list` refresh and allow-once completion

## Immutable accepted artifact

```text
artifact=openrill-step011r8-approval-creation-notice-ui-list-refresh-v1.zip
sha256=c1d7805ac2f1598085aa800755efe4c0fe8ec143a93c028907e226bbd6b116be
```

The accepted ZIP is immutable. Baseline promotion and next-step state are recorded in the later source tree rather than by mutating the Windows-tested artifact.
