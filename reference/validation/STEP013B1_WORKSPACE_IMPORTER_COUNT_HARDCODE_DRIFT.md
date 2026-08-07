# OR-ISSUE-094 — STEP013B1 workspace importer count hardcode drift

## Exact command and symptom

```text
node scripts/run-step001-suite.mjs
```

The lock alignment verifier correctly reported:

```text
OPENRILL_WORKSPACE_LOCK_ALIGNMENT_PASS importers=27 dependencies=67
```

The retained unit test rejected it because it hardcoded `importers=26` from the pre-adapter workspace.

## Code-confirmed root cause

The test duplicated a mutable workspace inventory count instead of comparing verifier output with the actual current root plus workspace package manifests.

## Impact

Adding the valid `packages/browser-playwright` importer made the canonical suite fail despite an exact manifest/lock graph.

## Fix

The test now counts current manifests from the root and configured workspace groups, parses the verifier’s importer count, and compares the two values. Missing dependency negative evidence remains exact and unchanged.

## Recurrence-prevention gates

- no literal current importer count is used in the retained alignment test;
- actual manifest inventory and verifier output must match;
- lock dependency sets remain exact rather than count-only;
- source version and architecture gates independently verify the new package inventory.
