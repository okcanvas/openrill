# STEP011R2 Browser Wait Predicate-only Diagnostic

## Symptom

The only timeout detail was:

```text
last=false
```

## Code-confirmed root cause

The generic browser wait loop evaluated a boolean expression and, on timeout, serialized only its last result. It did not read the mounted app state, visible error alert, Vue version, document readiness, loaded resources, or captured browser diagnostics.

## Impact

Different failures—missing Vue, blocked module, bootstrap HTTP denial, WebSocket rejection, and application exception—collapsed to the same output.

## Fix

The shared browser evidence helper now emits:

```text
OPENRILL_BROWSER_EVIDENCE_BEGIN
{ pageState, diagnostics, lastValue }
OPENRILL_BROWSER_EVIDENCE_END
```

The snapshot excludes protocol tokens and private filesystem paths.

## Recurrence gate

A focused test forces a failed connection predicate and verifies that the error includes the visible UI alert and an earlier runtime exception rather than `last=false` alone.
