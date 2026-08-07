# OR-ISSUE-251 — Partial package build was run before dependency dist materialization

## First observation

A direct build of only the newly changed package reported many unresolved `@openrill/*` modules while current dependency packages had no `dist` outputs.

## Direct cause

OpenRill package exports point at each workspace package's current `dist`. Building a dependent package in isolation before its dependency graph is materialized is not a valid clean-source verification path.

## Classification

Validation procedure / build bootstrap. This is related to but separately observed from OR-ISSUE-234.

## Correction

Use the root workspace build, whose TypeScript references establish dependency order, for clean-source verification. Focused package tests run only after that build. Immutable ZIPs still exclude every `dist` directory.

## Recurrence gate

STEP020D acceptance deletes generated outputs and runs `node scripts/workspace-runner.mjs build` before focused tests. No partial package build result is used as Product evidence.
