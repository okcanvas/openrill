# STEP012C Historical Schema Owner Scope Gap

## Issue

`OR-ISSUE-062 — HISTORICAL_ACCEPTANCE_SCHEMA_OWNER_SCOPE_GAP`

## Symptom discovered during STEP012C

STEP012C legitimately raises the State owner schema from 8 to 9 through `009_automation_protocol_run_linkage.sql`. A repository scan after the migration found that active nested acceptance and the actual STEP011 Chromium fixture still contained release-specific schema-8 predicates. Without correction, a valid schema-9 package would pass product execution but fail historical regression marker parsing or reject the database as a schema mismatch.

Concrete pre-fix paths included:

```text
scripts/run-step011-live.mjs
  identity.schemaVersion !== 8
  OPENRILL_STEP011_LIVE_PASS schema=8

scripts/run_step011_acceptance.py
scripts/run_step012a_acceptance.py
scripts/run_step012ar1_acceptance.py
scripts/run_step012b_acceptance.py
scripts/run_step012br1_acceptance.py
  schema=8 marker predicates or local SCHEMA literals
```

## Code-confirmed root cause

OR-ISSUE-057 corrected the STEP008/009/010 shared live scripts but its recurrence boundary did not include STEP011 actual Chromium or every historical acceptance runner added afterward. Those files treated a historical feature's original schema number as if it owned the current package schema.

The State package already owns the authoritative constant:

```ts
OPENRILL_STATE_SCHEMA_VERSION = 9
```

Historical regression must verify its feature behavior against the current package schema, not demand its original release schema.

## Impact

- schema migrations after STEP012A could produce false nested failures;
- actual browser success could be discarded by stale marker regexes;
- each future schema change would require unsafe manual edits across historical runners;
- package acceptance would conflate historical feature identity with current State identity.

## Fix

- `run-step011-live.mjs` imports `OPENRILL_STATE_SCHEMA_VERSION` from built State and uses it for both identity assertion and success marker.
- active historical Python runners derive `SCHEMA` from `packages/state/src/migrations.ts`.
- nested marker regexes interpolate the derived current schema.
- STEP012C acceptance alone asserts exact current schema 9 and migration 009 identity.
- retained accepted evidence documents keep their historical schema 8 text unchanged.

## Automated recurrence prevention

STEP012C gates require:

1. no active STEP011 live literal comparison or marker `schema=8`;
2. every active historical runner to derive `SCHEMA` from the State owner source;
3. nested marker predicates to interpolate current `SCHEMA`;
4. current acceptance to require schema 9 and migration 009;
5. the full historical regression chain to run under the current schema.
