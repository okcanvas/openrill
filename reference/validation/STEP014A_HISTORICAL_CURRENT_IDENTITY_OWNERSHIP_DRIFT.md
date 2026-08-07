# OR-ISSUE-124 — historical tests froze the current schema and package identity

## Symptom

Canonical regression failed after schema 12/current STEP014A identity was introduced. STEP013C tests still required the global schema to equal 11, and the STEP013CR2 manifest test required the current package generator/verifier to remain labeled STEP013CR2.

## Cause

Historical feature-retention tests owned mutable current-release identity instead of only their historical migration/feature contract.

## Correction

STEP013C tests require migration 011 and a current schema at least 11. Package identity tests derive the current version/STEP from the root package and current manifest. STEP014A alone owns exact schema 12 and current identity.
