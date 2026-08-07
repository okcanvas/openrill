# OR-ISSUE-209 — Candidate HANDOFF rewrite weakened failure-asset continuity

## First observed
STEP016B governance preflight.

## Classification
Documentation / handoff recurrence. No Product runtime impact.

## Symptom
The candidate HANDOFF retained unresolved OR-ISSUE-190/191 but omitted recently closed OR-ISSUE-206/207 and weakened the explicit reason that Connector work is speculative without a real adapter contract.

## Direct cause
The root HANDOFF was rewritten as a current-state summary without carrying forward the complete continuity set required by earlier recurrence gates.

## Correction
HANDOFF now includes the current accepted baseline, unresolved OR-ISSUE-190/191, closed OR-ISSUE-206/207, and the real-system prerequisite for Connector work.

## Prevention
Current governance treats unresolved and immediately preceding closed failure assets as a required handoff continuity set. Root document replacement must be followed by this current governance check before canonical execution.
