# OR-ISSUE-131 — Durable Tool scope was not an execution boundary

## Symptom
A child budget stored a reduced Tool list, while the model still received every global Tool schema and ToolRegistry could execute any registered Tool.

## Root cause
Scope persistence and Kernel model/dispatch ownership were disconnected.

## Correction
Kernel filters model Tool definitions by `allowedToolNames` and rejects out-of-scope dispatch with `AGENT_TOOL_NOT_ALLOWED`.

## Gate
A child allowed only `echo` sees only `echo`; a forged `forbidden` call fails before Tool execution.
