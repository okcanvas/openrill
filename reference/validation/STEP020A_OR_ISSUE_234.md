# OR-ISSUE-234 — Workspace links targeted current packages before their exported dist existed

## Observation

After rematerializing `node_modules/@openrill/*` links to the STEP020A source root, TypeScript reported many `Cannot find module '@openrill/...'` errors even though package names and dependency edges were correct.

## Direct cause

OpenRill package exports resolve through each package's `dist` output. The current source-root links were correct, but STEP020A had not yet produced those outputs, so TypeScript package resolution had no export targets.

## Correction

- Use the accepted STEP019B build outputs only as a local resolution bootstrap.
- Run the full workspace build immediately afterward so every `dist` is regenerated from STEP020A source.
- Verify all workspace module links resolve inside the current STEP020A root.
- Exclude all `dist` and `node_modules` material from the source ZIP.

## Recurrence proof

Acceptance runs current-root module-link validation, cleans build outputs, and then performs a complete workspace build before focused Product tests.
