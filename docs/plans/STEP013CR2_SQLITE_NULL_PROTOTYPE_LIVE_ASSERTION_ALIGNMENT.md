# STEP013CR2 — SQLite Null-Prototype Live Assertion Alignment

```text
identity=STEP013CR2_SQLITE_NULL_PROTOTYPE_LIVE_ASSERTION_ALIGNMENT
version=0.13.11-step013cr2
schema=11
baseline=STEP013B3_BROWSER_ARTIFACTS_AND_BOUNDED_EVIDENCE
retained_feature=STEP013C_AUTOMATION_BROWSER_EXECUTION_DURABLE_LEDGER_AND_RESTART_RECOVERY
retained_correction=STEP013CR1_RESTART_ATTEMPT_POINTER_AND_TYPED_RECOVERY_DIAGNOSTICS
```

## Purpose

Correct only the prototype-sensitive assertion that caused the real Windows STEP013CR1 aggregate to report `139/140 FAILED` after the recovered model invocation row already contained the exact expected values.

## In scope

- field-value assertion for the interrupted model invocation;
- explicit null-prototype behavioral regression;
- preservation of CR1 attempt-pointer and typed-diagnostic corrections;
- updated Windows live fixture, acceptance runner, issue evidence, and handoff documents.

## Out of scope

No Browser Tool, protocol operation, schema migration, repository behavior, recovery transition, Automation identity, ledger shape, privacy policy, or Artifact contract changes.
