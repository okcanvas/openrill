# STEP016C Local multi-turn continuation and running Host attachment

```text
step=STEP016C_LOCAL_MULTI_TURN_CONTINUATION_AND_RUNNING_HOST_ATTACHMENT
version=0.16.3-step016c
state_schema=15
accepted_baseline=STEP016B_FIRST_RUN_MODEL_CONNECTIVITY_AND_LOCAL_CONVERSATION_FLOW
accepted_checks=WINDOWS_FIRST_RUN_68/68
```

## Product scope
- `openrill ask --conversation-id <id>` continues one durable Conversation.
- `openrill conversation list` and `conversation show <id>` expose durable history.
- The CLI attaches to a READY running Host through the authenticated local protocol.
- If no Host exists, one ephemeral Host is started and owned by the CLI.
- `conversation.execute` returns terminal status, assistant text, usage and persistence evidence.
- Full prior user/assistant history is supplied to the configured model on every continuation.
- Workspace authorization and immutable Conversation model profile remain enforced.

## Excluded
- no external or paid model acceptance;
- no browser;
- no Connector or Mattermost implementation without a real executable system;
- no installer/background service/update work.

## Promotion
Windows promotion uses real DPAPI, one persistent foreground Host, and a bounded loopback Responses fixture. It proves two turns, history propagation, list/show, Host preservation, explicit stop and quiescent cleanup.

```text
human_work_minutes=NOT_RECORDED
windows_multi_turn_live=PENDING_ENV
browser=NOT_RUN
external_model=NOT_RUN
connector=DEFERRED_NO_REAL_SYSTEM
```
