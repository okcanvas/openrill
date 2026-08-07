# OR-ISSUE-165 — Empty provider Tool name escaped to Tool Runtime

## Cause
Terminal flush emitted accumulators without asserting that canonical name resolution completed.

## Correction
The adapter emits through one helper that requires both Tool-call identity and non-empty canonical name. Missing names fail as `MODEL_STREAM_INVALID` before dispatch.
