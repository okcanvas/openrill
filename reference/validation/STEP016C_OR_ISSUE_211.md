# OR-ISSUE-211 — STEP016B accepted-baseline identity was only partially promoted

## First observed

STEP016C canonical package-candidate validation, in the retained STEP012BR1 accepted-baseline scope test.

## Symptom

The current accepted baseline declared STEP016B, version `0.16.2-step016b`, checks `WINDOWS_FIRST_RUN_68/68`, and the STEP016B ZIP SHA, but retained the STEP016AR1 artifact path, evidence path, and dimensional integration/harness values.

## Direct cause

The STEP016B Windows promotion updated individual fields instead of replacing and validating the accepted-baseline identity as one atomic object. The mixed object was internally inconsistent even though its primary step/checks/SHA fields looked current.

## Classification

Governance / accepted-baseline atomic identity alignment. No Product runtime defect.

## Correction

- align `artifact` and alias `zip` to the STEP016B immutable ZIP;
- align `evidence` to the STEP016B Windows first-run acceptance document;
- align dimensional required-integration and harness status to the accepted STEP016B live path;
- cross-gate step, version, checks, artifact/zip, SHA, evidence, and dimensions as one current accepted identity.

## Recurrence prevention

A later promotion must replace and validate the complete accepted-baseline identity. Updating only step/checks/SHA is not sufficient. Historical tests may consume this object dynamically but must not repair or reinterpret mixed current identity.
