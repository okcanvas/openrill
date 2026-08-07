# STEP014DR5 — Control UI Entrypoint Discovery and Static Asset Route Alignment

## Identity
- version: `0.14.8-step014dr5`
- schema: 14 unchanged
- accepted baseline: STEP013CR2
- retained product: STEP014D + STEP014DR1–DR4

## Windows evidence
STEP014DR4 proved the complete external-model delegation path: two direct children completed, one depth-2 grandchild completed, the root resumed on attempt 2 and completed, and all `agent.spawn`/`agent.wait` calls succeeded. The remaining failure was HTTP `404` when the live fixture requested `/assets/app.js` before launching Chromium.

## Code-confirmed cause
`apps/agent-web/public/index.html` and `scripts/workspace-runner.mjs` own the real module entrypoint `/assets/web/browser-app.js`. The live fixture alone requested the nonexistent historical path `/assets/app.js`.

## Correction
- define one canonical Control UI module entrypoint contract;
- validate that `index.html` owns exactly one matching module script;
- derive the build destination from the same contract;
- make live acceptance fetch `/`, discover and validate the served module entrypoint, then fetch that exact module;
- do not add a compatibility alias for `/assets/app.js`;
- retain actual Chromium tree/detail rendering as the final acceptance proof.

## Exclusions
No schema, Protocol, Tool, delegation, provider, UI feature, accepted-baseline, or compatibility-route change.
