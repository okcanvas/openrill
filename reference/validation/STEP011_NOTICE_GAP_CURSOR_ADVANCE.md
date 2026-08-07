# STEP011 notice gap cursor advancement

## Exact symptom

When the browser received notice sequence `5` while its last contiguous cursor was `3`, the client could advance its cursor to `5` before the missing sequence `4` had been recovered.

## Code-confirmed root cause

The previous client updated the cursor with the maximum received sequence rather than requiring `sequence == cursor + 1`. The server replay acceptance also exposed the newest server cursor instead of preserving the client's accepted replay base.

## Impact

Reconnect could begin after sequence `5`, permanently skipping a missing notice. The projection and durable Host state could then disagree without another detectable gap.

## Fix

The client now drops duplicates, advances only on the next contiguous sequence, preserves its cursor on a gap, enters typed `RESYNC_REQUIRED`, obtains `ui.snapshot`, and reconnects from the snapshot cursor. Successful replay returns the requested replay-base cursor.

## Detailed evidence

`apps/agent-web/src/api/local-protocol-client.ts` computes `expected = cursor + 1` and returns before assignment on mismatch. `services/agent-host/src/transport/notice-window.ts` returns `{resyncRequired:false,cursor}` for successful replay. Unit fixtures require cursor `3` to remain unchanged after receiving sequence `5`.

## Recurrence-prevention gate

STEP011 acceptance checks the client and replay source contracts, executes duplicate/gap unit fixtures, and requires the Chromium reload/resume path with only a non-secret cursor in local storage.
