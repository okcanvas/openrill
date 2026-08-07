# STEP013CR1 — Restart Attempt Pointer and Typed Recovery Diagnostics

```text
identity=STEP013CR1_RESTART_ATTEMPT_POINTER_AND_TYPED_RECOVERY_DIAGNOSTICS
version=0.13.10-step013cr1
schema=11
baseline=STEP013B3_BROWSER_ARTIFACTS_AND_BOUNDED_EVIDENCE
retained_feature=STEP013C_AUTOMATION_BROWSER_EXECUTION_DURABLE_LEDGER_AND_RESTART_RECOVERY
```

## Purpose

Correct the real Windows STEP013C restart failure without widening the Browser Tool surface or changing schema 11.

## Binding changes

1. An interrupted RUNNING attempt remains attached to the recovered Run as `ABORTED/HOST_RESTART`.
2. `startExecution()` remains the only owner that creates the next attempt and replaces `current_attempt_id`.
3. A typed `ConversationError` crossing the Automation executor becomes `AUTOMATION_CONVERSATION_<CODE>`.
4. The autonomous two-Host fixture prints a privacy-safe durable recovery snapshot before failure cleanup.

## Retained STEP013C behavior

- 15 Browser Tools;
- migration 011 and durable Browser operation/evidence ledger;
- tool checkpoints and safe post-checkpoint request suffix;
- model invocation restart closure;
- same Automation Run and Agent Run identity;
- stale Browser session rejection and explicit reopen;
- screenshot Artifact, bounded evidence, process/orphan zero.

## Exclusions

No schema migration, Browser protocol operation, new Tool, remote worker, distributed lease transfer, profile attach, evaluate, batch, upload, or PDF support is added.
