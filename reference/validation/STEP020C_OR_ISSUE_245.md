# OR-ISSUE-245 — Clean workspace build ordered Task Flow before its new Conversation dependency

## Failure

The first STEP020C full acceptance failed during clean `tsc -b`. STEP020C added a direct `@openrill/conversations` dependency to `@openrill/task-flows`, but `tsconfig.build.json` still listed `packages/task-flows` before `packages/conversations`. With every `dist` removed, the Task Flow compiler could not resolve the Conversation package and the resulting no-emit state cascaded into dependent projects.

## Correction

The root build reference order now places `packages/conversations` immediately before `packages/task-flows`. The workspace lock also records the direct dependency.

## Gate

STEP020C governance checks the ordering and workspace lock alignment; every acceptance begins by removing all `dist` outputs and completing the full workspace build.
