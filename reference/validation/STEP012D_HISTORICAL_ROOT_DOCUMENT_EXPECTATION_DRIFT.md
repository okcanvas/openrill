# STEP012D historical root-document expectation drift

## Issue

`OR-ISSUE-069 — HISTORICAL_ROOT_DOCUMENT_EXPECTATION_AFTER_CURRENT_UI_CUTOVER`

## Exact symptom

After STEP012D correctly moved the current candidate and accepted-baseline statements in `README.md`, `HANDOFF.md`, `PLANS.md`, `ROADMAP.md`, and `VALIDATION.md`, the full canonical suite failed:

```text
not ok - current root documents identify STEP012C and retain accepted history
```

The failing historical STEP012BR1 test still required every mutable root document to identify STEP012C, STEP012BR1 `187/187`, and STEP011R8 `198/198`.

## Code-confirmed root cause

`tests/unit/historical-acceptance-baseline-scope-step012br1.test.mjs` mixed two ownership classes:

- mutable current root baseline/next-cut documents, owned by the current release;
- immutable accepted historical evidence, owned by dedicated `reference/validation/*_WINDOWS_LIVE_ACCEPTED.md` records.

The test therefore reintroduced the same historical ownership defect after STEP012D became the current UI/browser owner.

## Affected path

```text
STEP012D root-document promotion
→ canonical historical STEP012BR1 test
→ old STEP012C/BR1/STEP011 strings required in current root docs
→ false canonical failure
```

## Impact

A valid current release could not update its own handoff documents without satisfying obsolete historical text requirements. Copying all old markers into every current root document would make baseline state ambiguous and increasingly unmaintainable.

## Fix

- Current root documents are checked only for the current STEP012D candidate and the current accepted STEP012CR1 `101/101` baseline.
- STEP012BR1 `187/187` and STEP011R8 `198/198` are verified in their dedicated immutable accepted-evidence documents.
- Historical tests no longer own mutable root document wording.

## Automated recurrence-prevention gate

The canonical test verifies current-root ownership separately from immutable historical evidence and fails if a historical runner/test again requires old release identity in all current root documents.
