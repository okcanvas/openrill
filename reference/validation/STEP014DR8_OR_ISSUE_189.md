# OR-ISSUE-189 — Final live-fixture cleanup failures were swallowed

## Symptom risk

The DR8 deterministic UI fixture originally retained the DR7-style `finally` block that called Chromium, Host and temporary-root cleanup through `.catch(() => undefined)`. A body failure could therefore be reported while a simultaneous cleanup failure—and potentially an orphaned process or socket—was silently discarded. A cleanup-only failure after otherwise successful assertions could also be reported as success.

## Direct cause

Partial Chromium launch cleanup had been corrected inside `launch()`, but final ownership remained split: the outer fixture owned all resources yet treated their cleanup errors as non-evidence. The lifecycle audit checked close ordering and orphan markers, not whether final cleanup failures were preserved.

## Correction

The deterministic UI fixture now captures the primary body error, attempts every cleanup independently, accumulates all cleanup failures, and throws:

- `OPENRILL_STEP014DR8_CLEANUP_FAILED` for cleanup-only failure;
- `OPENRILL_STEP014DR8_BODY_AND_CLEANUP_FAILED` with an `AggregateError` containing the primary and every cleanup failure when both occur.

No Chromium, Protocol client, Host close, Host closed wait or temporary-root removal failure is swallowed.

## Recurrence prevention

- current live cleanup must not contain `.catch(() => undefined)` suppression;
- primary and cleanup failures must remain jointly observable;
- the lifecycle audit checks the current final-cleanup aggregation markers;
- focused and aggregate static gates retain the no-swallow contract.
