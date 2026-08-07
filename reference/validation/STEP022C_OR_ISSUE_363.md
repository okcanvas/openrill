# OR-ISSUE-363 — STEP022B governance still required the obsolete exact-operation test title

## Observed problem

After correcting the historical STEP022B protocol test to allow additive operations, its governance test still searched for the old phrase `four exact read-only Connector ledger operations`.

## Correction

The governance assertion now requires the corrected retained-capability phrase and no longer reinstates the obsolete global exact-count semantics.

## Recurrence gate

When a historical assertion is intentionally corrected, its meta-governance must be updated to the same semantic contract rather than preserving stale wording.
