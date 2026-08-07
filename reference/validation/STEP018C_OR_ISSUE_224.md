# OR-ISSUE-224 — Mutable ModelRequest references collapsed temporal benchmark evidence

## Observation

The first STEP018C benchmark run passed eight of ten scenarios. The no-fake-progress and structured-discovery traces appeared to show later Tool results in earlier model requests.

## Direct cause

`createScriptedModelAdapter.onRequest` received a `ModelRequest` whose `messages` array was subsequently extended by the Agent Kernel. The benchmark recorder retained the mutable object reference rather than a value snapshot. Inspecting the array after the Run therefore collapsed multiple request-time states into the final state.

## Classification

```text
owner=BENCHMARK_HARNESS
product_regression=NONE
state_schema_change=NONE
```

## Correction

The recorder performs a JSON value snapshot inside `onRequest` before control returns to the Agent Kernel. Assertions also select Tool results by exact `toolCallId` rather than positional assumptions.

## Prevention

- Temporal trace evidence is copied at the observation boundary.
- Regression tests require `snapshotRequest(request)` at every benchmark request recorder.
- Structured discovery assertions identify the exact `describe` result by Tool call identity.

The correction does not alter Agent Kernel Product behavior.
