# STEP012DR4 Windows live accepted

## Immutable accepted identity

```text
step=STEP012DR4_AUTOMATION_HISTORY_ROW_SELECTOR_ISOLATION
version=0.12.10-step012dr4
schema=9
state=WINDOWS_LIVE_ACCEPTED
checks=180/180
zip_sha256=46097b9ec753b46741705823a5a9a67ab191d6fe3350db43f64e43b516807658
```

## Exact user-reported marker

```text
STEP012DR4_AUTOMATION_HISTORY_ROW_SELECTOR_ISOLATION checks=180/180 state=PASSED schema=9 history_selector=ISOLATED durable_ledger=ONE_RUN process_output=BOUNDED_POLLING host_ready=AWAITED startup=PHASED vendor_build=ALIGNED static_serving=BYTE_VERIFIED evidence=STARTUP_BOUNDED ui=AUTOMATION_CRUD_RUN_HISTORY browser=CHROMIUM mobile=PASS
```

## Accepted scope

This immutable Windows result closes the STEP012D Automation Control UI vertical slice and corrective revisions DR1 through DR4. It proves actual Chromium, exact one durable manual AutomationRun, bounded process-output observation, Host READY gating, phased UI startup, vendor-aware Vue build, byte-verified static serving, isolated history-row selectors, and mobile layout.

The accepted ZIP is never modified in place. STEP013A starts from that ZIP and records this file as the closure handoff.
