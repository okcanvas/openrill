# OR-ISSUE-194 — Historical accepted-baseline test froze mutable schemaVersion

## Evidence

STEP015A changed `config/current-accepted-baseline.json` from schema 1 to schema 2 so Product,
Integration, Optional UI, Harness, and Package status could be represented independently.
Canonical file `historical-acceptance-baseline-scope-step012br1.test.mjs` failed:

```text
Expected values to be strictly equal:
2 !== 1
```

The failing source asserted `accepted.schemaVersion === 1` while the same test otherwise delegated
current step/check/SHA ownership to the mutable baseline file.

## Classification

`HARNESS / HISTORICAL_CURRENT_STATE_FREEZE`

## Prior class

This is the same ownership class as multiple STEP014 historical current-version and exact-object
freeze issues. The previous prevention mechanism was incomplete because it covered step/version
literals but not the mutable accepted-baseline schema version.

## Correction

Historical tests now require a positive integer schema and validate the current record's required
fields. The current STEP owns exact schema 2 semantics.

## Product impact

None. The failure occurred before any Sandbox Product regression.
