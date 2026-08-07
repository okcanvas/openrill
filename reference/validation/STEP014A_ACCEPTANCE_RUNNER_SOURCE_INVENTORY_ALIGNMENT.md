# STEP014A acceptance runner source inventory alignment

## Issue

`run_step014a_acceptance.py` attempted to read `packages/tool-runtime/src/registry.ts`, but the accepted source tree contains only `packages/tool-runtime/src/index.ts`.

The runner therefore failed before any external validation stage and could not produce a deterministic aggregate marker.

## Root cause

The acceptance predicate named an assumed implementation file instead of deriving the current Tool Runtime source inventory from the package boundary.

## Correction

The runner enumerates every `*.ts` file directly under `packages/tool-runtime/src` and scans the resulting source surface together with Browser Tool and Host protocol ownership.

The predicate still rejects public `agent.spawn` and `agent.wait`; only the nonexistent-file assumption was removed.

## Recurrence gate

`delegation-boundaries-step014a.test.mjs` requires:

- no `packages/tool-runtime/src/registry.ts` literal in the runner;
- dynamic enumeration of `packages/tool-runtime/src/*.ts`;
- every statically named repository file read by the runner to exist.
