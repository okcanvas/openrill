# STEP012C Historical Accepted Baseline Document Ownership Drift

## Issue

`OR-ISSUE-064 — HISTORICAL_ACCEPTED_BASELINE_DOCUMENT_OWNERSHIP_DRIFT`

## Exact symptom

Running historical STEP012AR1/STEP012B under the STEP012C package produced exactly fifteen root-document failures: `baseline-accepted-step`, `baseline-accepted-sha`, and `baseline-feature` across README, HANDOFF, PLANS, ROADMAP, and VALIDATION. The current documents correctly promoted STEP012BR1 and described STEP012C, but the historical AR1 runner still required STEP012AR1 to remain the current accepted baseline and STEP012A to remain the current feature.

## Code-confirmed root cause

OR-ISSUE-061 delegated mutable current/next ownership from STEP011 and later runners, but STEP012AR1 retained three mutable root assertions per document. A historical acceptance runner cannot own which later artifact is currently accepted or which later feature is current.

## Fix

The AR1 and B runners retain eight checks per root document, but they now verify current release identity plus immutable AR1 history: AR1 step, `163/163`, STEP012A feature ownership, STEP011 history, current-claim-zero, and stale wording. Current accepted baseline/SHA/current feature coherence is owned only by STEP012C acceptance.

## Recurrence prevention

Focused source gates reject `baseline-accepted-step`, `baseline-accepted-sha`, and mutable `baseline-feature` checks in historical AR1/B. Root documents must retain AR1/STEP012A history without claiming AR1 as current.
