# OpenRill Local Protocol Architecture

## Reference observations

OpenClaw source demonstrates explicit protocol versions, closed connect/response/event schemas, first-frame handshake enforcement, pre-auth payload limits, handshake timeout, untrusted proxy protection, authenticated dispatch, and outbound buffer guards. The verified evidence is `OC-PROTO-001~012` and `OC-GW-011`.

OpenRill does not copy the OpenClaw method names or handshake payload. Mature plugin/device/auth-migration surfaces are excluded.

## Module decomposition

```text
HTTP upgrade
  → UpgradePolicy
  → WebSocketCodec
  → Handshake/Auth
  → OperationRegistry
  → NoticeWindow
```

- `UpgradePolicy`: direct loopback, Host, Origin, forwarded-header, path, version, and subprotocol checks.
- `WebSocketCodec`: narrow RFC 6455 text boundary without compression/fragmentation.
- `Handshake/Auth`: one pre-auth frame, version negotiation, separate profile token, timeout, limits.
- `OperationRegistry`: closed input/output validation, permission tags, stable errors, idempotency.
- `NoticeWindow`: monotonic sequence, bounded replay, explicit resync.

## Wire contract

```json
{"type":"open","minProtocol":1,"maxProtocol":1,"client":{"id":"web","version":"1","platform":"windows","kind":"web"},"credential":{"kind":"profile-token","token":"<private>"},"cursor":0}
{"type":"accepted","protocol":1,"connectionId":"...","capabilities":{"operations":[],"notices":["host.lifecycle"]},"snapshot":{"host":{}},"cursor":2,"resyncRequired":false}
{"type":"call","callId":"...","idempotencyKey":"...","operation":"diagnostics.ping","input":{"echo":"hello"}}
{"type":"result","callId":"...","ok":true,"output":{"echo":"hello"}}
{"type":"notice","topic":"host.lifecycle","sequence":3,"emittedAt":"...","data":{"state":"READY"}}
```

## Current operation surface

- `host.status`
- `diagnostics.ping`

Conversation, run, approval, workspace, skill, automation, and artifact operations remain closed until their owning state/service steps are implemented.

## Persistence

Connections, idempotency entries, and notice replay are memory-only. STEP004 introduces no database files or migration.
