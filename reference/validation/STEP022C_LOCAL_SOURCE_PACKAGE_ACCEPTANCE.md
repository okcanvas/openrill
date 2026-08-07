# STEP022C Local Source Package Acceptance

This document is the self-contained handoff evidence for the STEP022C candidate.

```text
STEP=STEP022C_MATTERMOST_REAL_CONNECTOR_DURABLE_VERTICAL_SLICE
VERSION=0.24.0-step022c
STATE_SCHEMA=25
SOURCE_PACKAGE=LOCAL_SOURCE_ACCEPTED
PROMOTION=WINDOWS_MATTERMOST_REAL_LIVE_PENDING
OFFICIAL_PRODUCT_BASELINE=STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE
ACCEPTED_BASELINE_VERSION=0.21.3-step021br2
ACCEPTED_CHECKS=82/82
ACCEPTED_ZIP_SHA256=4f763933b37235b2ed7f87f1c1922fc934fdf80bb4135b8e37b12b274f1a1ed5
```

## Implemented boundary

STEP022C packages a real Mattermost Extension over the STEP022B schema-25 durable Connector runtime. The vertical slice authenticates through Mattermost REST, receives `posted` events over WebSocket, applies exact DM/channel-mention/thread routing, persists ingress before adoption, schedules the admitted Run, projects terminal assistant output to one logical delivery, records the provider receipt, and recovers without duplicate durable or remote replies. Public status and doctor results are closed, identity-checked and redacted.

## Final local evidence

```text
LOCAL_ACCEPTANCE=32/32 PASSED
RECORDED_AUTOMATED_RUN_SECONDS=80.177
FINAL_RECORD_STATE_RECHECK=32/32 PASSED
FOCUSED_MATTERMOST=24/24
RETAINED_PRODUCT=61/61
AFFECTED_REGRESSION=23/23
GOVERNANCE=241/241
CANONICAL_FILES=181
CANONICAL_TESTS=945/945
CANONICAL_FAILED=0
CANONICAL_SKIPPED=0
ARCHITECTURE=37 packages / 99 edges / 186 sources
EXPORTS=37/37
WORKSPACE_LOCK=38 importers / 102 dependencies
WORKSPACE_MODULE_LINKS=99 edges / 37 materialized
MANIFEST=1795/1795
```

The unchanged canonical runner was also executed through deterministic contiguous file groups because one outer container observation window ended before the single-process marker returned. The grouped inventory was mechanically proven equivalent to the complete sorted canonical inventory:

```text
GROUPS=30 + 30 + 30 + 30 + 30 + 30 + 1
EXPECTED_FILES=181
EXECUTED_FILES=181
UNIQUE_FILES=181
MISSING=0
EXTRA=0
ORDER_EXACT=true
TESTS=945/945
```

`OR-ISSUE-341` through `OR-ISSUE-365` independently record every implementation, validation, lifecycle, security and execution-environment failure found during this step.

## Promotion boundary

The source package is not the official Product baseline until the real Windows/Mattermost harness passes. Required command:

```powershell
pnpm install --frozen-lockfile
pnpm acceptance:step022c:live
```

Expected inner live evidence is `56/56` with `live_harness=STEP022C_H1_REAL_MATTERMOST_DM_MENTION_THREAD_DELIVERY_AND_RESTART`. The official baseline remains STEP021BR2 until that actual run succeeds.
