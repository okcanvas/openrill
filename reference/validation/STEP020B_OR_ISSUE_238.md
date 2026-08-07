# OR-ISSUE-238 — Current continuation rewrite omitted retained OR-ISSUE-213

## Observation

The first full STEP020B canonical run failed in `tests/unit/live-child-close-step016ch1.test.mjs`.
The retained STEP016CH1 recurrence test requires the exact `OR-ISSUE-213` token in both mutable
continuation assets, `HANDOFF.md` and `VALIDATION.md`. The STEP020B current-state rewrite omitted
that token even though the immutable issue, Windows attempt, issue registry and recurrence gate were
all still present.

## Direct cause

The current continuation rewrite copied only a selected subset of historical continuity tokens. It did
not derive the required retained issue set from the canonical recurrence tests, so the pre-observed child
close lifecycle failure became invisible from ZIP-entry handoff documents.

## Correction

- Restore `OR-ISSUE-213` in both `HANDOFF.md` and `VALIDATION.md`.
- Record this recurrence independently as `OR-ISSUE-238`.
- Add a STEP020B governance assertion that both mutable continuation documents retain
  `OR-ISSUE-213` and `OR-ISSUE-238`.
- Keep the original STEP016CH1 behavioral test unchanged.

## Product impact

No Task Flow Product behavior failed. The failure was a ZIP-only continuity defect detected before
source/package acceptance.

## Evidence

- failing canonical file: `tests/unit/live-child-close-step016ch1.test.mjs`
- original issue: `reference/validation/STEP016C_OR_ISSUE_213.md`
- recurrence gate: `docs/testing/RECURRENCE_PREVENTION_GATES.md`
- corrected continuation assets: `HANDOFF.md`, `VALIDATION.md`
