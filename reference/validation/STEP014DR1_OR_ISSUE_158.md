# OR-ISSUE-158 — External-model root failure lost typed durable diagnostics

## Actual Windows symptom

The STEP014D external-model stage reported only:

```text
OPENRILL_STEP014D_ROOT_RUN_FAILED:{"status":"FAILED","items":[]}
```

This proves the root Run failed before any delegation was created, but it does not identify whether the model invocation failed from authentication, rate limit, invalid request, transport, stream, budget, or another typed boundary.

## Code-confirmed cause

The durable database already owns Run, attempt, model-invocation and event metadata. The live fixture queried only `conversation.get` and `delegation.list`, then deleted its temporary data root in `finally`. No privacy-safe DB diagnostic was emitted before cleanup.

## Correction

`step014dr1-live-diagnostics.mjs` reads only bounded metadata: Run state, attempt terminal reason and usage, model invocation status/error code/token counts, latest event types, delegation status/depth, and a SHA-256 plus length of the hidden failure message. It never emits conversation messages, Tool arguments, reasoning, transcript, event payload, API key, headers, or provider response text.

## Recurrence gate

A SQLite fixture verifies `MODEL_RATE_LIMITED` survives while the raw provider message does not. The live catch block emits diagnostics before Host/temp-root cleanup.
