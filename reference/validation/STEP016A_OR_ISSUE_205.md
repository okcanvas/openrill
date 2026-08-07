# OR-ISSUE-205 — Current HANDOFF rewrite temporarily dropped retained unresolved issue visibility

## First observed

STEP016A final handoff audit before deterministic packaging.

## Classification

Documentation / failure-asset continuity.

## Symptom

A current-candidate HANDOFF rewrite preserved the STEP015B accepted baseline but temporarily omitted
explicit visibility of retained unresolved STEP014 assets OR-ISSUE-190 and OR-ISSUE-191.

## Direct cause

The handoff was rewritten around the new setup/doctor scope without carrying forward the complete
unresolved-asset section from the accepted baseline lineage.

## Correction

`HANDOFF.md` explicitly retains:

- OR-ISSUE-190: optional Control UI raw child transcript privacy backlog;
- OR-ISSUE-191: historical Chromium automation orphan backlog;
- OR-ISSUE-203: resolved Harness evidence defect and its accepted H1 lineage.

## Recurrence prevention

- every current HANDOFF must retain all unresolved issues from the accepted baseline lineage;
- candidate rewrites may add status but may not silently drop an unresolved issue;
- current governance asserts OR-ISSUE-190 and OR-ISSUE-191 remain visible until explicitly resolved;
- accepted baseline step, checks, and immutable ZIP SHA remain adjacent to retained issue status.

## Product impact

None. This was a ZIP-only continuation and documentation continuity defect.
