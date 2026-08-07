# OR-ISSUE-109 — Historical schema and Tool ownership freeze

## Symptom

After schema 11 and the ledger wrapper were introduced, retained STEP013B1/B2/B3 boundary tests treated schema 9/10, the then-current `registry.register(tool(...))` spelling, and the two-argument `registerBrowserTools(tools, browserRuntime)` call shape as permanent current-product contracts.

## Cause

Historical acceptance mixed owned feature invariants with mutable latest-release identity.

## Correction

STEP013B1/B2/B3 retain their accepted Tool-name prefixes and minimum owned schema migrations. STEP013C alone owns exact schema 11 and ledger wrapping. Historical tests now accept equivalent `register(tool(...))` helper registration and an additive third registration-options argument while still proving the original Tool prefix and protocol non-expansion.

## Gate

`browser-automation-boundaries-step013c.test.mjs` owns exact schema 11 and the 15-Tool ledger wrapper. Retained B1/B2/B3 tests prove their accepted prefixes and minimum schemas without freezing current registration spelling, current argument count, or the latest release.
