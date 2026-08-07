# OR-ISSUE-169 — Typed Tool error code absent from live diagnostics

## Symptom
The Windows log showed the second `agent.spawn` as `isError=true` but did not preserve its typed error code.

## Cause
`tool.completed` and checkpoint events stored only Tool name, call ID, and `isError`.

## Correction
Agent Kernel extracts only an allow-listed uppercase error code from `{error:{code}}` and stores that code in durable event metadata. Diagnostics expose the code but never Tool arguments, result payload, or private message.

## Gate
A typed Tool error must appear as `errorCode` in diagnostics while its private error message remains absent.
