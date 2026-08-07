# OR-ISSUE-147 — Historical current package identity was frozen at STEP014C

## Symptom and code-confirmed cause

A STEP014C boundary test required the root package and mutable manifest scripts to remain `0.14.2-step014c`, conflicting with the STEP014D package identity.

## Correction

The test retains STEP014C identity in its immutable plan while deriving mutable generator/verifier identity from the current root package. STEP014D owns exact current step/version.

## Recurrence gate

The retained STEP014C boundary test and STEP014D acceptance compare current root, source alignment, manifest generator, verifier and package manifest identity.
