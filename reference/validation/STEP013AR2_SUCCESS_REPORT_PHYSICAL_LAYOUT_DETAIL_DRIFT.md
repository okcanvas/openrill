# OR-ISSUE-087 — STEP013AR2 successful report physical-layout detail drift

## Exact symptom
Source and fresh extraction both passed `169/169`, and source/fresh ZIPs were byte-identical, but acceptance report SHA differed. Source validation used root-hoisted `@openrill` links while fresh validation intentionally used package-local links with root scope absent.

## Root cause
The acceptance report copied the full successful verifier output into the pass detail. That output intentionally included physical diagnostics such as `scopes`, `materialized`, and `root_scope=present|absent`. Both layouts satisfied the same logical current-root resolution contract, but their successful reports were not byte-identical.

## Impact
A valid cross-layout fresh extraction could not reproduce the sealed canonical acceptance report even though every logical gate and final marker matched.

## Fix
On success, aggregate acceptance records the stable detail `workspace_module_links_pass`. On failure, it preserves the full bounded verifier output including importer/dependency or layout diagnostics.

## Automated recurrence prevention
- static focused test requires success normalization and failure-detail preservation
- source validation with root scope present
- fresh validation with root scope absent
- source/fresh report SHA equality
- source/fresh ZIP byte equality

## Closure condition
STEP013AR2 source and root-scope-absent fresh acceptance reports must be byte-identical and Windows final marker must pass.
