# STEP013CR1 Windows Live Null-Prototype Assertion Failure

## Observed command

```cmd
pnpm acceptance:step013cr1
```

## Exact aggregate result

```text
STEP013CR1_RESTART_ATTEMPT_POINTER_AND_TYPED_RECOVERY_DIAGNOSTICS checks=139/140 state=FAILED schema=11 baseline=STEP013B3 retained_feature=STEP013C adapter=PLAYWRIGHT_CORE tools=15 automation_browser=AUTONOMOUS ledger=ACTION_EVIDENCE recovery=RESUME_AND_REOPEN attempt_pointer=ABORTED_RETAINED diagnostics=TYPED_AND_PRESERVED reporter=TAP process_count=0 chromium_orphan=0
```

Only `browser-live` failed. Both Host children started, child 2 closed normally, and the final process/orphan counters were zero.

## Exact failure

```text
AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
+ actual - expected

+ [Object: null prototype] {
- {
    errorCode: 'MODEL_INTERRUPTED_BY_RESTART',
    status: 'FAILED'
  }
```

The actual SQLite row contained the exact expected values. Failure came from prototype-sensitive deep equality between Node `DatabaseSync`'s null-prototype row and an ordinary object literal. This evidence does not promote STEP013CR1 because the packaged aggregate remained FAILED.
