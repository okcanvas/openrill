# STEP013A historical Host fixture Browser config and drain expectation drift

## Issue

```text
OR-ISSUE-081
STEP013A_HISTORICAL_HOST_FIXTURE_BROWSER_CONFIG_AND_DRAIN_EXPECTATION_DRIFT
```

## Actual canonical failures

After the Browser configuration and BrowserRuntime Host drain were added, the first full serial suite produced two failures:

```text
Host scheduler is fail-closed without an executor and executes persisted due work when injected
TypeError: Cannot read properties of undefined (reading 'enabled')
```

and:

```text
Host shutdown awaits active Runs and ProcessManager before closing SQLite
assert.ok(coordinator >= 0 && manager > coordinator && database > manager)
```

The exact command was:

```text
node scripts/run-step001-suite.mjs
```

The aggregate result was `251 tests`, `249 pass`, `2 fail`, `0 skipped`.

## Root cause

1. `automation-scheduler-step012b.test.mjs` manually constructed a complete materialized Host config. STEP013A added the required closed `browser` materialized section, but this historical fixture omitted it. The Host correctly evaluated `config.browser.enabled`; the fixture was no longer a valid materialized config.
2. `process-manager-close-step011r7.test.mjs` encoded the old textual order `runCoordinator.close -> processManager.close -> SQLite close`. STEP013A intentionally drains `BrowserRuntime` and `ProcessManager` together through `Promise.allSettled` after the Run coordinator and before SQLite. Searching for the old direct `await processManager?.close()` no longer represented the product contract.

## Impact

- the canonical suite rejected a correct additive Host configuration boundary;
- the historical shutdown gate could not observe the new Browser drain and therefore provided a false failure rather than proving quiescence;
- leaving the fixture partial would permit future required materialized config sections to fail with unrelated `undefined` errors.

## Fix

- the manual materialized Host fixture now includes the complete disabled/default Browser section;
- the shutdown source gate now requires Run coordinator close first, then one `Promise.allSettled` containing both BrowserRuntime and ProcessManager drains, with SQLite close after both entries;
- STEP013A boundary tests independently require Browser drain before SQLite and missing-driver preflight before profile lock acquisition.

## Recurrence prevention

- historical manual materialized-config fixtures must include every required closed section;
- shutdown tests assert lifecycle barriers and drain ownership rather than a single old direct-call spelling;
- the full serial canonical suite remains mandatory after every Host lifecycle extension.
