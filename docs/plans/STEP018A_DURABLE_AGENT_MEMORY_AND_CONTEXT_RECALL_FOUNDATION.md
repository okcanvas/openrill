# STEP018A_DURABLE_AGENT_MEMORY_AND_CONTEXT_RECALL_FOUNDATION

```text
version=0.18.0-step018a
state_schema=16
baseline=STEP016C Windows 97/97
openclaw_reference=openclaw-main.zip sha256:1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82
```

## Product goal

A user can explicitly ask OpenRill to remember a durable fact in one Conversation, restart or open another Conversation, retrieve that fact through bounded evidence-backed recall, and explicitly forget it. Another Workspace must not see it.

## Included

- `packages/memory` and `packages/tools-memory`;
- State migration 016 and SQLite FTS5 index;
- memory remember/search/get/forget tools;
- Conversation/Run provenance;
- Host tool registration and memory-specific system guidance;
- duplicate replay, restart persistence, workspace isolation and soft forget;
- sensitive credential/private-key rejection;
- OpenClaw source baseline, audit and capability gap matrix;
- deterministic Windows live using actual Host, SQLite and scripted model adapter.

## Excluded

- embeddings or paid model calls;
- automatic transcript capture, dreaming or consolidation;
- cross-workspace/cross-agent sharing;
- browser, Mattermost or Connector work;
- STEP017A distribution promotion.

STEP017A remains a packaged but deferred branch asset. The accepted baseline and implementation parent for STEP018A is STEP016C H2.

## Product acceptance

1. schema 16 and FTS5 materialize from a clean database;
2. remember is idempotent by normalized content hash;
3. search is bounded and workspace-scoped;
4. get returns exact bounded text and provenance;
5. forget removes the record from get/search without deleting audit history;
6. memory survives State close/reopen;
7. credentials and private keys are rejected;
8. Agent tool loop remembers in Conversation A and recalls in Conversation B;
9. actual Host registers memory tools and injects durable-memory guidance;
10. Windows live executes the same product slice with no external model/browser.
