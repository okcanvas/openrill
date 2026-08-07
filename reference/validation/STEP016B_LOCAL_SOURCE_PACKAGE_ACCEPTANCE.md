# STEP016B Local Source/Package Acceptance

```text
STEP016B_FIRST_RUN_MODEL_CONNECTIVITY_AND_LOCAL_CONVERSATION_FLOW
checks=67/67
state=PASSED
version=0.16.2-step016b
schema=15
source=ACCEPTED_PROFILE
package=CANDIDATE
windows_first_run_live=PENDING_ENV
promotion=WINDOWS_FIRST_RUN_LIVE_PENDING
automated_run_seconds=70.357
external_model=NOT_RUN
browser=NOT_RUN
connector=DEFERRED_NO_REAL_SYSTEM
```

## Measured evidence

```text
focused_product=4/4
affected_first_run_regression=16/16
governance=46/46
canonical_files=97
canonical_tests=546/546
canonical_skipped=0
source_version=29/28/3
workspace_lock=29/76
workspace_links=73/28
architecture=28/73/123
exports=28/28
manifest=1255/1255
```

The Product tests use the actual ephemeral Host, configured model resolver, actual Responses adapter and durable SQLite state. The local profile uses an injected test secret provider and a bounded loopback Responses server; it makes no external model or browser claim.
