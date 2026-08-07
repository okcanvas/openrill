# OR-ISSUE-357 — Host test used a profile name rejected by the real Config contract

## Observed problem

A path-with-spaces requirement was incorrectly applied to the profile identifier, which has a closed no-space grammar.

## Correction

The fixture uses a valid profile id and places spaces only in data, config, workspace, and Extension paths.

## Recurrence gate

`tests/unit/validation-governance-step022c.test.mjs` and the relevant STEP022C focused or Windows Live path retain this boundary.
