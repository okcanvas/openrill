# OR-ISSUE-164 — OpenAI item_id/call_id accumulator split

## Symptom
Windows STEP014DR2 emitted four model Tool-call events, completed two, and failed the third with an empty Tool name.

## Exact evidence
The durable failure message had length 16 and SHA-256 `45600058b9dfe037667b24cb7c9aec83965189c5de30f5a57504f5407d04f806`, exactly matching `tool not found: `.

## Cause
The adapter keyed item-added by `call_id` and argument events by `item_id`, creating two accumulators for one provider call.

## Gate
A two-call SSE fixture with mixed identities must produce exactly two canonical calls.
