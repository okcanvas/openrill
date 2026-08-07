# OR-ISSUE-151 — Protocol-only live validation did not prove the Control UI

## Symptom and code-confirmed cause

The first STEP014D live fixture called Protocol and inspected the static app bundle, but did not execute the served UI in a browser. That could pass with a runtime mount or rendering defect.

## Correction

The live fixture discovers/uses Chromium, opens the served Control UI, selects the Delegated work route, verifies tree rows including depth 2 and bounded detail rendering, then closes Chromium and checks no orphan remains.

## Recurrence gate

The live-script boundary test requires Chromium discovery, `nav-delegations`, tree/detail selectors and the `chromium_orphan=0` success marker.
