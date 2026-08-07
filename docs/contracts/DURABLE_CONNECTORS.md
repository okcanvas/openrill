# Durable Connector Contract

STEP022B owns the connector-neutral durable boundary between external systems and the existing OpenRill Conversation/Run execution plane.

## Ownership

- Connector Extensions normalize provider events and perform provider sends.
- The Host owns adapter registration and lifecycle.
- `ConnectorRuntimeService` owns all durable connector ledgers.
- Connector code never receives State repositories or direct Conversation/Run mutation authority.

## Ingress invariant

1. Validate connector/account identity.
2. Persist the external event and its payload hash.
3. Return `acknowledge=true` only after that transaction commits.
4. Claim with a bounded lease.
5. Normalize through the registered adapter.
6. Atomically create or reuse the binding and create the Conversation Message and Run.

An exact external event replay returns the durable result. Reusing the same external event ID with different lane, payload version, payload, route, or text fails closed.

## Binding invariant

The tuple `(connectorId, accountId, externalScopeId, externalConversationId, externalThreadId)` maps to one OpenRill Conversation. Binding creation and the first Conversation/Message/Run admission occur in one SQLite transaction.

## Delivery invariant

A logical delivery is separate from delivery attempts and provider receipts.

```text
PENDING -> DELIVERING/CLAIMED -> DISPATCHED -> DELIVERED | SUPPRESSED | PENDING | UNCERTAIN | DEAD
```

- A definitive pre-send or provider rejection may create a new bounded attempt.
- Once dispatch may have reached the provider, an unknown outcome becomes `UNCERTAIN`.
- `UNCERTAIN` is never replayed automatically.
- An accepted provider receipt is committed atomically with attempt and logical delivery completion.
- Receipt replay must match provider message, conversation, thread, and receipt content.

## Restart invariant

- Expired ingress claims return to claimable state because the external event identity remains durable.
- Expired pre-dispatch delivery claims return to `PENDING`.
- Expired post-dispatch delivery claims become `UNCERTAIN` and receive a dead-letter record.
- Adapter registration is Host-lifecycle scoped and duplicate-free after restart.

## Diagnostics invariant

Local Protocol exposes read-only account, ingress, delivery, and dead-letter ledgers. It never exposes payloads, claim tokens, Extension-provided error summaries, or provider receipts.

## Deferred

STEP022B does not implement Mattermost transport, polling/WebSocket loops, provider-specific target resolution, media, reactions, streaming edits, or multi-account routing policy. Those begin in STEP022C/STEP022D.
