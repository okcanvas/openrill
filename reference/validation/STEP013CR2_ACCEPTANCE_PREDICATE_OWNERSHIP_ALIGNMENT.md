# STEP013CR2 Acceptance Predicate Ownership Alignment

## Symptom

A local aggregate reported three non-product failures after the underlying focused tests passed:

- `live-model-interruption`;
- `tap-reporter:focused-sqlite-row-assertion`;
- `focused-test-reporter`.

## Root causes

1. The interrupted-model literal moved to `recovery-live-assertions.mjs`, but the static gate inspected only the live fixture.
2. The TAP command lookup selected the first substring occurrence, which was `STAGE_TIMEOUTS.get("focused-sqlite-row-assertion")`, not the stage tuple.
3. The inherited STEP013B1A reporter suite still has four tests, but its expected count was accidentally changed to five while adding the new suite.

## Correction

Predicates now inspect the actual owner, require TAP on a matching stage-command line, retain the historical reporter count at four, and own the STEP013CR2 suite count separately. `OR-ISSUE-120` gates these distinctions.
