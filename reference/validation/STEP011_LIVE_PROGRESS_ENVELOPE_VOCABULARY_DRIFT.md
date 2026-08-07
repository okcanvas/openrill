# STEP011 live progress envelope vocabulary drift

## Exact symptom

The STEP010A projection treated a real Kernel progress notice carrying `type=model.text_delta` and `data.delta` as an unknown card instead of appending streamed assistant text.

## Code-confirmed root cause

The projection compared the canonical event against `model.text.delta` and read fields as though the input were a durable event row or the STEP010A fixture. The real Host publishes the Agent Kernel progress envelope as `{runId,type,data}` and the actual event type contains an underscore: `model.text_delta`.

## Impact

A live model response could complete durably while the Control UI showed an unknown event card and no streamed assistant text. Static fixture success did not prove the real Host envelope.

## Fix

The canonical browser projection now consumes `{runId,type,data}`, recognizes `model.text_delta`, and reads the text from `data.delta`. STEP010A fixture compatibility remains an explicit separate branch and unknown future events remain visible.

## Detailed evidence

`packages/agent-kernel/src/kernel.ts` publishes `model.text_delta` with a nested `data` object. `apps/agent-web/src/control-ui-projection.ts` now matches that exact vocabulary and shape. `tests/unit/control-ui-step011.test.mjs` supplies the exact live envelope and requires a text card.

## Recurrence-prevention gate

STEP011 acceptance checks the canonical source tokens, runs the exact Kernel-payload unit test, and requires the separate real Host + Chromium fixture to render the final streamed text exactly once.
