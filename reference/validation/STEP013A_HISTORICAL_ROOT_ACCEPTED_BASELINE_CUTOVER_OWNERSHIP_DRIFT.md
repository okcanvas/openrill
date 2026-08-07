# STEP013A historical root accepted-baseline cutover ownership drift

## Issue

```text
OR-ISSUE-082
STEP013A_HISTORICAL_ROOT_ACCEPTED_BASELINE_CUTOVER_OWNERSHIP_DRIFT
```

## Actual canonical failure

The STEP013A serial suite failed one historical ownership test:

```text
not ok 140 - current root documents separate current release identity from retained STEP012D feature ownership
error=README.md
```

The test required every mutable root document to contain:

```text
STEP012D_AUTOMATION_CONTROL_UI_WINDOWS_VERTICAL_SLICE
STEP012CR1_HISTORICAL_BROWSER_REGRESSION_OWNERSHIP
101/101
```

The exact command was `node scripts/run-step001-suite.mjs`. All BrowserRuntime product tests passed; the aggregate was `251 tests`, `250 pass`, `1 fail`, `0 skipped`.

## Root cause

The historical STEP012BR1 scope test correctly became manifest-dynamic for the current release identity during DR1, but its accepted-baseline assertions remained frozen at the pre-DR4 state. After STEP012DR4 was Windows accepted 180/180, mutable root documents correctly advanced to DR4. The historical test still treated the retired STEP012D candidate and STEP012CR1 accepted baseline as permanent root-document ownership.

This conflated three distinct owners:

- current candidate identity: current `PACKAGE_MANIFEST.json`;
- latest accepted baseline: STEP012DR4 180/180 and immutable SHA;
- older historical evidence: dedicated STEP012D/CR1/BR1/STEP011 evidence files.

## Impact

- a correct accepted-baseline promotion was rejected by the canonical suite;
- keeping the old assertions would force mutable root documents to accumulate stale current ownership forever;
- operators could read STEP012CR1 as the official baseline after DR4 had already passed Windows.

## Fix

- current root documents must contain the current manifest identity and latest accepted STEP012DR4 marker/SHA;
- STEP012D feature closure is verified in the immutable STEP012DR4 acceptance evidence;
- STEP012CR1, STEP012BR1, and STEP011R8 remain verified only in their dedicated historical evidence files;
- historical tests no longer force superseded baseline identities into mutable root documents.

## Recurrence prevention

Every accepted-baseline promotion must update the latest accepted assertion independently from older evidence assertions. Mutable root documents own only the current candidate and latest accepted baseline. Historical markers remain immutable in dedicated evidence documents.
