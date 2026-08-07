# STEP012BR1 Windows Live Accepted

## Immutable accepted artifact

```text
step=STEP012BR1_HISTORICAL_ACCEPTANCE_BASELINE_OWNERSHIP
version=0.12.3-step012br1
schema=8
checks=187/187
state=WINDOWS_LIVE_ACCEPTED
zip_sha256=b90721d4d24f7467355f1f2dcd7e94d65f03517a7f60ff8208fa0c915f6ccbde
```

## Exact Windows marker

```text
STEP012BR1_HISTORICAL_ACCEPTANCE_BASELINE_OWNERSHIP checks=187/187 state=PASSED schema=8 scope=HISTORICAL_BASELINE_DELEGATED scheduler=WAKE_TIMER claim=TRANSACTIONAL lease=RENEWED recovery=CLAIM_REQUEUE_RUNNING_FAIL catch_up=SKIP_RUN_ONCE_BOUNDED shutdown=ASYNC_QUIESCENT executor=INJECTED_FAIL_CLOSED protocol_ui=DEFERRED browser_regression=CHROMIUM
```

## Accepted scope

The immutable package validates the STEP012A Automation domain/persistence foundation, STEP012B scheduler lifecycle, transactional claim and renewable lease, restart recovery, bounded catch-up, async shutdown quiescence, injected fail-closed executor boundary, actual Chromium regression, immutable nested reports/manifests, and delegated historical baseline ownership.

The accepted ZIP and SHA must not be rewritten. Later releases consume this record as previous accepted evidence.
