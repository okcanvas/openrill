# OR-ISSUE-173 — Live fixture requested a nonexistent Control UI asset

## Symptom
The Windows STEP014DR4 external-model run completed the root and all required delegated work, then failed `404 !== 200` while requesting `/assets/app.js`.

## Code-confirmed cause
The actual module entrypoint is `/assets/web/browser-app.js` in both `apps/agent-web/public/index.html` and the workspace build output. The live fixture alone hardcoded `/assets/app.js`.

## Impact
A fully successful delegation run was reported as failed before actual Chromium UI rendering.

## Correction
A shared static contract owns the canonical module path. Build validates and copies to that path. Live acceptance fetches the served index, validates its single module entrypoint, and requests the discovered canonical asset.

## Gate
Missing, duplicate, unsafe or mismatched entrypoints fail; the canonical asset is served as JavaScript; `/assets/app.js` remains unsupported.
