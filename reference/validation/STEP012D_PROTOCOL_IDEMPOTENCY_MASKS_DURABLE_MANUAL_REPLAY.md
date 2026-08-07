# STEP012D Protocol idempotency masks durable manual replay

## Issue

`OR-ISSUE-070 — UI_PROTOCOL_IDEMPOTENCY_MASKS_DURABLE_MANUAL_REPLAY`

## Exact symptom / pre-fix reproduction

The initial STEP012D replay button reused the same value for both identities:

```text
Automation durable requestKey
Local Protocol call idempotencyKey
```

The call was:

```text
call("automation.run_now", { jobId, requestKey }, requestKey)
```

On replay, the Local Protocol connection-level idempotency cache could return the first operation response before `automation.run_now` reached the schema-9 durable request ledger. The UI could therefore display a cached `created=true` result instead of proving durable `created=false` replay after a reconnect-capable protocol boundary.

## Code-confirmed root cause

`apps/agent-web/src/browser-app.ts` coupled two independent contracts:

- the Protocol envelope idempotency key, which deduplicates one transport operation on one Local Protocol connection;
- `automation.run_now.input.requestKey`, which durably deduplicates manual Automation Runs in SQLite across calls and reconnects.

Using one key for both allowed the outer cache to mask the inner durable behavior.

## Affected path

```text
Replay button
→ same Protocol idempotency key
→ Local Protocol cached output
→ automation.run_now handler not invoked
→ schema-9 durable replay path not exercised
```

## Impact

The actual-browser acceptance could appear to test durable replay while only testing the connection-memory cache. It would not prove one AutomationRun and one model invocation across distinct protocol operations.

## Fix

The UI preserves and resends the same durable `requestKey` in the operation input but allows `LocalProtocolClient.call()` to generate a new Protocol idempotency key for every button action.

```text
same durable requestKey
+ new Protocol envelope idempotency key
→ handler executes again
→ repository returns existing AutomationRun with created=false
```

## Automated recurrence-prevention gate

- Focused source test rejects a third `requestKey` argument on `automation.run_now`.
- The actual Chromium fixture requires `RUN_REPLAYED`.
- SQLite must contain exactly one manual AutomationRun and the model provider must receive exactly one request.
