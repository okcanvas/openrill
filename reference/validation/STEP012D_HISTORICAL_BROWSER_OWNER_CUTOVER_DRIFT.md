# STEP012D historical browser owner cutover drift

## Issue

`OR-ISSUE-068 — HISTORICAL_DEFERRED_BROWSER_GATE_AFTER_UI_OWNER_CUTOVER`

## Exact symptom

After STEP012D intentionally added the Automation route and CSS, the canonical suite failed four assertions even though the current UI implementation compiled:

```text
not ok - STEP012B stays below protocol, UI, and Conversation/model execution boundaries
not ok - accepted browser surface remains byte-identical
not ok - STEP011 live delta is schema-owner only
```

The historical STEP012B test inspected the **current** browser source for absence of Automation UI, and the STEP012CR1 no-impact test required current browser files to remain byte-identical to STEP012BR1.

## Code-confirmed root cause

Historical tests retained temporary ownership constraints after their explicit handoff point:

- STEP012B's package-boundary test mixed a durable scheduler-package invariant with a temporary assertion that current Protocol/UI contain no Automation surface.
- STEP012CR1's accepted-no-impact test continued to compare the current browser surface after STEP012D became the designated actual-browser owner.

## Affected path

```text
STEP012D intentional UI change
→ canonical historical tests
→ current browser source inspected under old deferred/no-impact rules
→ false regression failure before actual Chromium acceptance
```

## Impact

A valid owner cutover was blocked by historical implementation-state assertions. Replacing the expected hashes with STEP012D hashes would have destroyed the meaning of the immutable accepted STEP012BR1 evidence.

## Fix

- STEP012B now checks only that `packages/automation/src/scheduler.ts` remains independent of Protocol, web, Conversation, and model packages; it no longer owns the current UI surface.
- STEP012CR1 tests preserve the immutable accepted baseline JSON and require the historical no-impact verifier to fail closed when STEP012D changes browser files.
- STEP012D alone owns actual Vue/Chromium acceptance for the changed browser surface.

## Automated recurrence-prevention gate

The canonical suite verifies:

- historical accepted baseline SHA/hashes remain unchanged;
- current STEP012D browser changes produce `OPENRILL_HISTORICAL_BROWSER_NO_IMPACT_FAIL` rather than a false no-impact PASS;
- scheduler package dependency boundaries remain intact;
- STEP012D live acceptance directly runs actual Chromium.
