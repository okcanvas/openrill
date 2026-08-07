# STEP022B Durable Connector Runtime, Ingress, Delivery and Binding

## Identity

```text
STEP=STEP022B_DURABLE_CONNECTOR_RUNTIME_INGRESS_DELIVERY_AND_BINDING
VERSION=0.23.0-step022b
STATE_SCHEMA=25
BASE=STEP022A_LOCAL_EXTENSION_PACKAGE_CONTRACT_AND_RUNTIME_REGISTRY
OFFICIAL_PRODUCT_BASELINE=STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE
PROMOTION=WINDOWS_CONNECTOR_RUNTIME_LIVE_PENDING
```

## Goal

Replace the connector identity stub with a connector-neutral durable runtime that can safely sit below Mattermost and later channel Extensions without creating a second execution engine.

## Product changes

- Schema 25 connector account, binding, ingress, delivery, attempt, receipt and dead-letter ledgers.
- Atomic binding plus Conversation/Message/Run admission.
- Persist-before-ACK ingress.
- Logical delivery separated from attempts and receipts.
- `MAYBE_ACCEPTED` quarantine without automatic replay.
- Host-owned Connector adapter registry integrated with STEP022A Extension lifecycle.
- Four closed read-only Local Protocol operations with redaction.
- Startup claim recovery.

## Explicit exclusions

- No real Mattermost server or network transport.
- No channel polling/WebSocket process.
- No connector-specific authentication UI.
- No attachment/media transport.
- No dead-letter mutation/replay protocol yet.
- No distributed connector leasing.

## Acceptance

Focused validation must cover schema, ingress replay, atomic binding, claim recovery, receipt replay, uncertain isolation, adapter registration, lifecycle unregistration, protocol closure/redaction, and Host restart. Windows live uses a real dynamically imported local Connector Extension and real Host/WebSocket/SQLite path, not a fake repository.
