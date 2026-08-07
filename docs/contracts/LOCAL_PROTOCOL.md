# OpenRill Local Protocol Contract

## Endpoint

- URL: `ws://127.0.0.1:<hostPort>/protocol` or loopback IPv6 equivalent.
- WebSocket subprotocol: `openrill.local.v1`.
- Remote exposure and trusted proxies are not supported in STEP004.

## Version negotiation

The client sends `minProtocol` and `maxProtocol`. The Host selects the highest supported overlapping version. STEP004 supports exactly version `1`.

## Frame model

### `open`

The first and only pre-auth frame. It contains protocol range, closed client metadata, a profile-token credential, and an optional notice cursor.

### `accepted`

Handshake success. It returns the selected protocol, connection ID, server identity, closed operation capabilities, current Host snapshot, current notice cursor, and `resyncRequired`.

### `rejected`

Handshake failure. It is distinct from an operation `result` and uses stable codes: `INVALID_HANDSHAKE`, `PROTOCOL_MISMATCH`, `AUTH_FAILED`, and `RESYNC_REQUIRED`.

### `call` / `result`

Every call requires `callId`, `idempotencyKey`, operation name, and closed operation input. Results correlate by `callId`. A repeated idempotency key with identical operation/input replays the cached result; different input fails with `IDEMPOTENCY_CONFLICT`.

### `notice`

Server notice with topic, monotonically increasing sequence, UTC timestamp, and data. STEP004 retains a bounded memory window; cursors outside the window require a full resync.

## Initial operations

| Operation | Permission | Input |
|---|---|---|
| `host.status` | `host.read` | `{}` |
| `diagnostics.ping` | `diagnostics.read` | `{ echo?: string }` |

Unknown operations and unknown input fields fail closed.

## Limits

- handshake timeout: 3 seconds
- pre-auth frames: exactly one
- pre-auth payload: 16 KiB
- authenticated frame payload: 64 KiB
- outbound buffered bytes: 256 KiB
- per-connection idempotency cache: 128 entries

## Persistence

Connections, replay notices, and idempotency cache are memory-only. No SQLite schema is introduced by STEP004.
