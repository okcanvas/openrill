# OR-ISSUE-239 — Current continuation rewrite omitted retained OR-ISSUE-214

## Observation

The second full STEP020B canonical run failed in `tests/unit/live-output-privacy-step016ch2.test.mjs`.
The retained STEP016CH2 contract requires `OR-ISSUE-214` or the exact H2 harness identity to remain
visible in `HANDOFF.md` and `VALIDATION.md`. Both current continuation assets omitted it.

## Direct cause

The first continuity correction restored the already-failing `OR-ISSUE-213` token only. The current
document rewrite still had no code-derived inventory of every mutable-asset requirement, so the adjacent
H2 authorized-history/secret-redaction failure remained hidden.

## Correction

- Restore `OR-ISSUE-214` in `HANDOFF.md` and `VALIDATION.md`.
- Record the recurrence independently as `OR-ISSUE-239`.
- Add STEP020B governance for both exact tokens.
- Execute every canonical test that reads `HANDOFF.md` or `VALIDATION.md` before rerunning the full suite.

## Product impact

No Task Flow or privacy behavior failed. This was a ZIP continuation visibility defect intercepted before
source/package acceptance.

## Evidence

- failing canonical file: `tests/unit/live-output-privacy-step016ch2.test.mjs`
- original issue: `reference/validation/STEP016C_OR_ISSUE_214.md`
- retained H2 evidence: `reference/validation/STEP016C_H2_HARNESS_ACCEPTANCE.md`
- corrected continuation assets: `HANDOFF.md`, `VALIDATION.md`
