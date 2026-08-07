# STEP022B OpenClaw Durable Connector Ingress and Delivery Audit

## Reference scope

OpenClaw is used as an answer key for failure boundaries, not as code to copy. Relevant inspected files from the retained OpenClaw source include:

- `extensions/mattermost/src/mattermost/monitor-ingress.ts`
- `extensions/mattermost/src/mattermost/reply-delivery.ts`
- corresponding ingress and delivery tests

## Extracted answer-key principles

1. Raw provider ingress must be persisted before dispatch acknowledgement.
2. Provider event identity and lane ordering must be explicit.
3. Retry classification must distinguish safe rejection from unknown provider acceptance.
4. A send that may have been accepted cannot be blindly replayed after a crash.
5. Provider receipt identity is durable evidence, not an in-memory return value.
6. Transport code should not own Conversation or Run state directly.

## OpenRill-native realization

OpenRill implements those principles through schema 25 and the existing durable Conversation/Run plane:

- connector ingress ledger before ACK;
- exact external-event replay;
- atomic connector binding plus Conversation/Message/Run admission;
- logical delivery, attempt and receipt tables;
- `DISPATCHED` versus `CLAIMED` crash classification;
- `UNCERTAIN` dead-letter quarantine;
- STEP022A Host Extension registry as the only adapter admission path.

## Deliberate differences

OpenRill does not import OpenClaw's channel runtime, plugin runtime, target model, or message abstractions. STEP022B remains connector-neutral. Mattermost-specific WebSocket, target and thread rules are deferred to STEP022C.
