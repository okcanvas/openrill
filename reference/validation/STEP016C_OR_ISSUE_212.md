# OR-ISSUE-212 — VALIDATION root handoff omitted the exact current candidate identity

## First observed

STEP016C canonical package-candidate validation in the retained STEP012BR1 root-document ownership test.

## Symptom

`VALIDATION.md` described STEP016C commands and accepted-baseline evidence but did not contain the exact current candidate identity `STEP016C_LOCAL_MULTI_TURN_CONTINUATION_AND_RUNNING_HOST_ATTACHMENT`.

## Direct cause

The validation document was rewritten around commands and promotion status without carrying the exact candidate identity required for ZIP-only continuation.

## Classification

Documentation / ZIP-only handoff current-candidate identity omission. No Product runtime impact.

## Correction

Restore the complete STEP, version, and schema in `VALIDATION.md`, retain the historical root-document gate, and cross-check all root handoff documents against the current package manifest identity.

## Recurrence prevention

Every root handoff document must contain the exact current manifest STEP and exact accepted-baseline STEP/checks/SHA. Descriptive shorthand such as `STEP016C` is not sufficient.
