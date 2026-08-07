# STEP013A Browser timeout unref liveness failure

## Issue

```text
OR-ISSUE-079
STEP013A_BROWSER_TIMEOUT_UNREF_LIVENESS_FAILURE
```

## Actual focused-test failure

The first bounded launch-timeout test injected a Browser driver that ignored `AbortSignal` and never resolved. The timeout timer was created and immediately `unref()`ed. Node ended the test while the Promise was still pending:

```text
failureType=cancelledByParent
error=Promise resolution is still pending but the event loop has already resolved
```

## Root cause

A timeout that is the sole authority for settling an awaited operation cannot be unreferenced. Aborting the signal also did not settle an adapter that ignored the signal because the original implementation awaited the adapter directly instead of racing it against the timeout.

## Impact

- launch/action timeout could hang indefinitely when an adapter failed to observe cancellation;
- a focused test could be cancelled rather than produce a deterministic Browser error;
- Host shutdown could wait on a Browser operation without a bounded terminal result.

## Fix

- race the adapter Promise against an explicitly rejecting timeout/abort Promise;
- keep the operation timeout timer referenced while the operation is awaited;
- translate launch operation timeout to `BROWSER_LAUNCH_TIMEOUT`;
- retain `unref()` only for the background idle-sweep timer, which is not an awaited completion authority.

## Recurrence gate

A driver that never resolves and ignores `AbortSignal` must fail within the configured bound with `BROWSER_LAUNCH_TIMEOUT`, leave runtime state `FAILED`, and allow `close()` to complete.
