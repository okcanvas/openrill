# STEP018A Windows Memory Live Acceptance

## Immutable Product identity

```text
step=STEP018A_DURABLE_AGENT_MEMORY_AND_CONTEXT_RECALL_FOUNDATION
version=0.18.0-step018a
state_schema=16
artifact=openrill-step018a-durable-agent-memory-context-recall-foundation-v1.zip
sha256=c9e5350dd5bd791a4e3412090e0c76cc0f0ac2bbfc9ed383e98666a1d42fb5c8
```

## User-provided Windows marker

```text
STEP018A_DURABLE_AGENT_MEMORY_AND_CONTEXT_RECALL_FOUNDATION checks=33/33 state=PASSED version=0.18.0-step018a schema=16 accepted_product_baseline=STEP016C_LOCAL_MULTI_TURN_CONTINUATION_AND_RUNNING_HOST_ATTACHMENT accepted_checks=WINDOWS_MULTI_TURN_97/97 memory=SQLITE_FTS5_DURABLE tools=REMEMBER_SEARCH_GET_FORGET provenance=CONVERSATION_RUN workspace=ISOLATED sensitive=REJECTED openclaw_reference=SOURCE_AUDITED external_model=NOT_RUN browser=NOT_RUN connector=DEFERRED_NO_REAL_SYSTEM windows_memory_live=PASSED promotion=READY automated_run_seconds=130.234
```

## Accepted dimensions

- Product Core: durable remember/search/get/forget.
- Required Integration: actual Windows Node SQLite FTS5, Host registration, restart persistence and workspace isolation.
- Package: deterministic source ZIP accepted before the Windows run.
- External model, Browser, Mattermost and Connector: not executed and not claimed.
