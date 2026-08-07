# OR-ISSUE-213 — STEP016C live fixture missed a pre-observed Host close event

## First evidence

The first real Windows STEP016C live run passed all source/package stages and timed out only in `windows-multi-turn-live` after 300.593 seconds. Aggregate result: `82/83 FAILED`; total automated run time: `440.407` seconds.

## Direct cause

The fixture executed:

```text
openrill stop
→ wait for stop command to return
→ register host.child.once("close")
```

On Windows, the Host process could close before the listener was registered. Node child-process close events are not replayed, so the fixture waited forever even though the Product stop path had already completed.

## Classification

```text
owner_dimension=HARNESS
product_runtime_change=NONE
product_version_change=NONE
state_schema_change=NONE
```

## Correction

```text
harness=STEP016C_H1_PREOBSERVED_CHILD_CLOSE_ALIGNMENT
```


`waitForChildClose()` now:

1. registers the close listener;
2. checks `exitCode` and `signalCode` for a close already observed;
3. uses a bounded typed timeout;
4. removes the listener on every settlement path.

The live fixture also emits bounded phase markers for setup, Host start, multi-turn execution, discovery and Host stop. Future timeouts therefore preserve the last completed phase.

## Prevention

Unit tests cover a child that was already closed, a later close, and a child that never closes. Current governance rejects direct post-stop `host.child.once("close")` ownership in the STEP016C live fixture.
