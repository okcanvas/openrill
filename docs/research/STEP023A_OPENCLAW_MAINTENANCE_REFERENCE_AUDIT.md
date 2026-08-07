# STEP023A OpenClaw Maintenance Reference Audit

Reference archive inspected directly: `openclaw-main.zip` supplied by the user. OpenRill does not copy OpenClaw runtime state ownership; OpenClaw is used as an answer key for operating patterns and failure classes.

## Source evidence inspected

- `src/tasks/task-registry.maintenance.ts`: periodic task sweep, in-progress guard, bounded yielding and terminal task prune policy.
- `src/tasks/task-registry.test.ts`: maintenance sweep retention and scheduled-sweep failure regressions.
- `extensions/browser/src/browser/session-tab-cleanup.ts`: self-rescheduling cleanup, overlap avoidance, `unref`, disposer waits for active cleanup.
- `extensions/browser/src/browser/session-tab-registry.sqlite.test.ts`: cleanup ownership/race tests, replacement-row protection, activity revoking cleanup, fail-closed capacity behavior.
- `src/config/sessions/store-maintenance.ts` and related tests: stale-entry pruning separated by ownership/category.

## Adopted principles

1. periodic cleanup is an owned Host/runtime responsibility, not an incidental read path;
2. concurrent or stale cleanup must not delete a newly-active/replacement resource;
3. large cleanup work is bounded and must make forward progress;
4. timer lifecycle is explicit and must not keep the process alive;
5. failures in a scheduled sweep must not corrupt active work.

## OpenRill-native strengthening

OpenRill adds durable SQLite lease ownership, deterministic persisted sweep continuation, explicit dependency protection across Task/Flow/Goal/Connector ledgers, and tombstone-before-delete. These are required by OpenRill's durable state graph and are not claimed to be direct OpenClaw copies.
