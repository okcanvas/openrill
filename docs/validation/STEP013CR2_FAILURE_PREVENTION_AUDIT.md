# STEP013CR2 Failure Prevention Audit

## OR-ISSUE-118

Symptom: Windows `browser-live` failed after actual and expected values matched because the actual SQLite row had a null prototype.

Root cause: the fixture used prototype-sensitive deep equality for a database row representation it did not own.

Correction: validate required row existence and the exact `status` and `errorCode` fields independently.

Permanent gates:

1. Null-prototype row with exact values passes.
2. Missing row fails.
3. Wrong status fails.
4. Wrong error code fails.
5. Current live source may not deep-compare the invocation row to an object literal.
6. Historical Windows evidence and Issue Registry entry must remain packaged.

## OR-ISSUE-119

Symptom: the new focused test passed, but the aggregate crashed with a timeout-map `KeyError`.

Correction: declare a bounded timeout in the same corrective step and gate both declarations.

## OR-ISSUE-120

Acceptance predicates must follow current code ownership and maintain independent expected test counts. Static substring matches may not select unrelated timeout or helper-call lines.

## OR-ISSUE-121

Current package identity and accepted baseline identity are separate contracts. Generator, verifier, and generated manifest must follow the current corrective release.
