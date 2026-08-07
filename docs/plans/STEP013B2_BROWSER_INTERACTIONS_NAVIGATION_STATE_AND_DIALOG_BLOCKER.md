# STEP013B2 Browser interactions, navigation state, and dialog blocker

## Identity

```text
STEP013B2_BROWSER_INTERACTIONS_NAVIGATION_STATE_AND_DIALOG_BLOCKER
version=0.13.7-step013b2
schema=9
baseline=STEP013B1A_WINDOWS_DETERMINISTIC_FOCUSED_TEST_REPORTER_ALIGNMENT
baseline_checks=106/106
baseline_zip_sha256=220009729163094365b1383fda1e059e2d9c5b69beb05f1476a162a608bd28ca
```

## Goal

Add the minimum safe Browser action layer on top of the accepted run-owned Browser lifecycle and read-only observation contract. Preserve provider neutrality and make navigation, ref invalidation, and dialogs explicit parts of action outcomes.

## Product changes

- six additional closed Tools: click/type/press/select/fill/wait;
- provider-neutral action union and page `act()` contract;
- public Playwright AI accessibility refs converted to opaque adapter IDs and `aria-ref=` locators;
- top-level navigation policy check before request dispatch and final URL check after action;
- fresh page snapshot embedded after action-triggered document navigation;
- stale ref returns fresh recovery snapshot but never replays the action;
- modal dialogs are observed, safely dismissed, and surfaced as `BROWSER_DIALOG_BLOCKED`;
- bounded action events and diagnostics.

## Security decisions

- no JavaScript evaluation;
- no coordinate click;
- no batch action;
- no dialog accept or prompt text response;
- no automatic stale-ref rematching or retry;
- no private-network navigation bypass;
- no persistent Browser storage;
- no schema migration or Browser protocol operation.

## Acceptance flow

```text
Host start
-> concrete Playwright adapter launch
-> run-owned session/page
-> deterministic local form
-> snapshot refs
-> type/fill/select/click/press/wait
-> denied action navigation blocked before dispatch
-> allowed click navigation returns fresh pageState
-> old ref rejected with recoverySnapshot and no dispatch
-> dialog click returns BROWSER_DIALOG_BLOCKED and safe dismiss
-> later explicit action succeeds
-> close and Host shutdown
-> process_count=0 chromium_orphan=0
```

## Deferred

Artifacts/evidence belong to STEP013B3. Automation-triggered execution, durable action ledger, and crash/restart recovery belong to STEP013C.
