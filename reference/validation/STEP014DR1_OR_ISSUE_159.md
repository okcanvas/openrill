# OR-ISSUE-159 — Historical STEP014D test froze mutable current release identity

## Symptom and code-confirmed cause

The retained STEP014D boundary test asserted the root package must forever remain `0.14.3-step014d` and that mutable manifest generators must forever own STEP014D identity. Any legitimate corrective release therefore failed canonical regression.

## Correction

The historical test now preserves STEP014D's immutable acceptance/package entrypoints and plan evidence. STEP014DR1 alone owns the current package/version and mutable manifest/verifier identity.

## Recurrence gate

The STEP014DR1 boundary test checks `0.14.4-step014dr1`, its new acceptance/package scripts, and retained STEP014D entrypoints without allowing a historical feature test to own current release identity.
