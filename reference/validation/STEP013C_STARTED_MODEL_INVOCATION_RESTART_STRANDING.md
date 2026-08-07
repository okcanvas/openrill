# OR-ISSUE-111 — STARTED model invocation stranded after restart

## Symptom

A process death during provider HTTP streaming leaves `model_invocations.status=STARTED` with no terminal timestamp or error.

## Impact

Historical request inventory becomes ambiguous and later request numbering/recovery diagnostics cannot distinguish active work from process-dead work.

## Correction

During incomplete Run recovery, every STARTED invocation for that Run becomes:

```text
status=FAILED
error_code=MODEL_INTERRUPTED_BY_RESTART
ended_at=<recovery time>
```

## Gate

Both Conversation and STEP013C focused tests assert the exact terminal row.
