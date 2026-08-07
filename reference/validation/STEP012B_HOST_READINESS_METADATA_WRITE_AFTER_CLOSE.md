# STEP012B Host Readiness Metadata Write After Close

## Actual symptom

A repeated STEP012B focused scheduler run completed all ten registered assertions, then Node added a file-level failure for post-test asynchronous activity:

```text
# Error: Test "Host scheduler is fail-closed without an executor and executes persisted due work when injected"
generated asynchronous activity after the test ended.

Error: ENOENT: no such file or directory, rename
'/tmp/openrill-step012b-host-.../runtime/host.json.<pid>.<time>.tmp'
-> '/tmp/openrill-step012b-host-.../runtime/host.json'
```

TAP summary:

```text
tests=11
pass=10
fail=1
```

## Code-confirmed root cause

`startLocalHost()` launched readiness as an unowned `void (async () => ...)()` task. The returned Host handle could be closed after Automation execution but before the readiness task completed its second metadata `persist()`.

`closeHost()` waited for server, scheduler, RunCoordinator, and ProcessManager, but did not cancel or await readiness. It removed `host.json` and released the profile lock while readiness could still be writing. The test then removed the profile root; the delayed atomic rename failed after test completion. The readiness Promise rejection also had no internal observation when a caller intentionally closed before awaiting `host.ready`.

## Impact

- Host close did not guarantee lifecycle-task quiescence.
- Metadata writes could occur after lock release or directory cleanup.
- Focused/canonical results could become timing-dependent file-level TAP failures.
- Windows and slower filesystems could expose the race more frequently.

## Fix

- Host owns `readinessTask` explicitly.
- Readiness delay is cancellable by close.
- `closeHost()` sets STOPPING, cancels the delay, serializes the STOPPING metadata snapshot, and awaits readiness task completion before server/service/SQLite teardown and metadata removal.
- Metadata writes are serialized through `metadataWriteTail` and capture their state snapshot at enqueue time.
- The Host attaches an internal rejection observer to `ready` while preserving rejection semantics for external callers.
- Genuine readiness failure schedules Host close without awaiting the same readiness task and therefore cannot deadlock.

## Deterministic recurrence fixture

The STEP012B Host scheduler test now configures `readyDelayMs=60000`, attaches an explicit rejection assertion to `host.ready`, executes persisted due Automation work, and closes immediately. Close must cancel the delay, reject readiness with `Host stopped before readiness`, wait for readiness quiescence, and permit immediate recursive profile deletion with no post-test activity.

## Automated recurrence-prevention gate

- `readinessTask` must be assigned, not launched as an unowned `void` async IIFE.
- close must call `cancelReadinessDelay()` and await `readinessTask` before metadata removal and lock release.
- metadata persistence must be serialized through `metadataWriteTail`.
- the focused fixture must use a long readiness delay and close-before-ready rejection assertion.
- canonical TAP must have no file-level asynchronous-activity failure.
