# @openrill/web

OpenRill Control UI application boundary.

## Current framework decision

```text
selection=VUE_3
decision=STEP010A_CONTROL_UI_FRAMEWORK_SELECTION
production runtime introduction=STEP011_CONTROL_UI_VERTICAL_SLICE
```

STEP010A keeps Vue and Lit comparison runtimes inside `apps/agent-web/spikes/`. The production package still has no Vue dependency; STEP011 must add the exact locked Vue runtime and bundler integration.

## Stable boundary

- Browser state is derived from Local Protocol snapshots and notices.
- `LocalProtocolClient` remains framework-neutral.
- `control-ui-projection.ts` owns cursor ordering, duplicate suppression, sequence-gap resync, fallback cards, and keyboard selection.
- UI code never accesses SQLite or Workspace files directly.
