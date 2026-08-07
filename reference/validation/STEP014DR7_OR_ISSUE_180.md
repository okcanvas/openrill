# OR-ISSUE-180 — Monolithic canonical child could lose bounded completion

## Symptom

A direct canonical invocation progressed through hundreds of passing subtests but did not return a final aggregate marker within the outer execution window.

## Root cause

The acceptance runner delegated the complete unit inventory to one long-lived Node test command. One child owned all output, cross-file global state, open-handle finalization and timeout evidence.

## Correction

`scripts/run-canonical-unit-batches.mjs` enumerates the exact sorted inventory, groups it for bounded progress reporting, executes every test file in its own Node child with an independent timeout and TAP summary, then aggregates exact tests/pass/fail/skipped totals.

## Recurrence gate

The current acceptance runner uses this canonical owner, checks the exact unit-file count and exact canonical total, and rejects any file timeout, non-zero exit, malformed TAP summary, skipped test or total-count mismatch.
