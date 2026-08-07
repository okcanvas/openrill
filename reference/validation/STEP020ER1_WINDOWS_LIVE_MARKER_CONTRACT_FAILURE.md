# STEP020ER1 Windows LIVE marker contract failure

```text
aggregate=59/60 FAILED
stage=windows-completion-retry-live PASS
focused_live=21/21 PASSED
promotion=BLOCKED
```

The Windows Product and retry Harness passed. The aggregate rejected the result because `scripts/run_step020er1_acceptance.py` required one exact marker string containing both `queue=SYSTEM_MESSAGE_WAKE_RUN` and `migration=TERMINAL_CHILD_SAFE_BACKFILL`, while `scripts/run-step020er1-completion-retry-live.mjs` emitted neither token.

This is not accepted as a Product or Windows restart failure. It is an acceptance-contract failure: two independently maintained marker literals drifted, and whole-string matching converted a successful Harness into a failed aggregate.

The operator-provided log records:

- stage return code `0` and stage state `PASS`;
- all 13 focused tests passed;
- inner Harness `21/21 state=PASSED`;
- aggregate `59/60 state=FAILED` with only `windows-completion-retry-live` rejected.
