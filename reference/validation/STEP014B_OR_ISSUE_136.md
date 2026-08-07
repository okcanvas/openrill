# OR-ISSUE-136 — New workspace omitted from clean TypeScript build graph

## Symptom

The first STEP014B aggregate removed every `dist` directory and then failed in `focused-build`:

```text
services/agent-host/src/lifecycle.ts: Cannot find module '@openrill/tools-delegation'
```

A manual build had passed only because `packages/tools-delegation/dist` already existed from focused development.

## Code-confirmed cause

`@openrill/host` declared `@openrill/tools-delegation` and the workspace lock importer contained it, but root `tsconfig.build.json` omitted `packages/tools-delegation` from project references. TypeScript therefore attempted to compile Host without first building the new package.

## Impact

A stale worktree could report a false build success while a fresh ZIP or Windows clean acceptance failed.

## Correction

- add `packages/tools-delegation` to root project references before `services/agent-host`;
- retain Host manifest and lock dependency edges;
- require zero-dist build validation in STEP014B acceptance.

## Recurrence gate

`delegation-execution-boundaries-step014b.test.mjs` verifies the root TypeScript reference, ordering before Host, Host dependency, and lock importer. The aggregate always removes `dist` before `focused-build`.
