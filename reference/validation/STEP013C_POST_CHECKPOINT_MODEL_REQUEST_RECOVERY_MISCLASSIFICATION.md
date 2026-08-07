# OR-ISSUE-110 — Post-checkpoint model request recovery misclassification

## Reproduction

```text
browser.open completes
run.checkpoint is appended
next model invocation starts
model.requested becomes latest Run event
Host process dies
```

The old implementation checked only whether the latest event was exactly `run.checkpoint`, so this safe state became FAILED/NON_RESUMABLE.

## Correction

Recovery finds the latest checkpoint and accepts only `model.requested` or `model.retry` after it. Partial text, reasoning, or Tool-call output remains non-resumable.

## Gate

Conversation and STEP013C focused tests create the exact event sequence and require `CREATED/RESUMABLE`.
