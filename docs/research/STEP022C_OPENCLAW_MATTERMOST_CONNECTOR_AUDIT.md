# STEP022C OpenClaw Mattermost Connector Source Audit

## Fixed answer-key source

```text
ARCHIVE=openclaw-main.zip
PACKAGE_VERSION=2026.7.2
SHA256=1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82
COPYING=NONE
```

Reviewed source owners include:

- `extensions/mattermost/src/mattermost/client.ts`
- `monitor-websocket.ts`
- `monitor-ingress.ts`
- `monitor-event-plan.ts`
- `reconnect.ts`
- `send.ts`
- `reply-delivery.ts`
- `target-resolution.ts`
- `thread-participation.ts`
- `probe.ts`
- `doctor.ts`
- `accounts.ts`

## Adopted principles

1. REST identity must be probed before considering the account usable.
2. WebSocket authentication and reconnect belong to the channel package, not the durable core.
3. Message routing distinguishes direct conversations, channel mention policy, and thread participation.
4. Provider send outcomes need explicit ambiguity handling; a transport exception after dispatch cannot be called safely unsent.
5. Operational status and doctor output are public contracts and must be redacted.
6. Channel code must not become the owner of Conversation/Run lifecycle.

## OpenRill-native differences

OpenRill does not copy OpenClaw's channel runtime. It preserves the schema-25 durable Connector ledger:

```text
posted event
→ persisted ingress
→ atomic binding + Conversation + Message + Run
→ AgentRunCoordinator
→ terminal assistant output
→ logical delivery + attempt
→ Mattermost POST
→ durable receipt or UNCERTAIN quarantine
```

OpenClaw remains the answer key for transport behavior and failure taxonomy. OpenRill remains the owner of execution identity, transactional state, replay, and restart guarantees.
