# STEP012CR1 Windows Live Accepted

## Immutable accepted artifact

```text
step=STEP012CR1_HISTORICAL_BROWSER_REGRESSION_OWNERSHIP
version=0.12.5-step012cr1
schema=9
state=WINDOWS_LIVE_ACCEPTED
checks=101/101
zip_sha256=3f2a47484f6341be98c00f189c12e2df7ec0e14e308de382d6bafddc90117062
```

## Exact Windows marker

```text
STEP012CR1_HISTORICAL_BROWSER_REGRESSION_OWNERSHIP checks=101/101 state=PASSED schema=9 feature=STEP012C protocol=CREATE_LIST_GET_UPDATE_RUN_NOW_HISTORY manual_idempotency=DURABLE run_link=PRE_EXECUTION_LEASE_GUARDED executor=CONVERSATION_RUN notices=DOMAIN_EXPLICIT shutdown=ABORT_QUIESCENT browser_scope=HISTORICAL_DELEGATED browser_regression=ACCEPTED_BASELINE_NO_IMPACT ui=DEFERRED_NEXT_STEP012D
```

This accepted baseline validates STEP012C Automation Protocol and production Conversation Run integration while delegating unchanged historical browser evidence. STEP012D re-owns actual Chromium because it changes the browser surface.
