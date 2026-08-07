# STEP012C Unbounded Vue Acquisition Wait

## Issue

`OR-ISSUE-063 — UNBOUNDED_EXACT_VENDOR_ACQUISITION_WAIT`

## Evidence boundary

During nested STEP012BR1 investigation, outer tool calls exceeded their execution bounds while the Python acceptance buffered output. A later background process-tree run proved the chain was progressing through repeated canonical suites and completed; therefore the earlier outer timeouts do **not** prove that Vue download was the cause.

The same investigation found an independent, code-confirmed validation defect: exact Vue network acquisition had no deadline at all. This document records that defect without attributing the earlier long chain duration to it.

## Code-confirmed defect

`scripts/vendor-vue-runtime.mjs` called:

```js
fetch(VUE_PACKAGE_URL, { redirect: "error", cache: "no-store" })
```

without an AbortSignal or any other deadline. If DNS, TCP, TLS, proxy, or response delivery neither succeeded nor failed, the exact-vendor prerequisite could block acceptance indefinitely. Existing archive byte bounds applied only after response progress and did not bound connection wait.

## Impact

- a future network stall could prevent explicit `runtime_unavailable` classification;
- CI might kill the outer process without a stable primary diagnostic;
- an environment prerequisite could look like a hung product test;
- exact vendor acquisition duration was not bounded by product-owned code.

## Fix

Exact network acquisition now uses `AbortSignal.timeout(VUE_DOWNLOAD_TIMEOUT_MS)` with a 15-second bound. Archive identity, SHA-512 integrity, maximum archive bytes, maximum unpacked bytes, exact entry selection, version/license checks, and byte-identical re-extraction remain unchanged.

A bounded download failure continues to be classified by STEP011 acceptance as `runtime_unavailable`; it is not promoted to a product defect or success.

## Automated recurrence prevention

- source gate requires exported `VUE_DOWNLOAD_TIMEOUT_MS` and a fetch `signal`;
- source gate rejects the prior unbounded fetch form;
- unit test verifies the bounded network-acquisition contract without making a network request;
- nested acceptance must emit a stable prerequisite result when the exact archive is unavailable.
