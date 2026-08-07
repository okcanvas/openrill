# OpenClaw Local Protocol Code Study

## Scope

This reference records source observations used for OpenRill STEP004. It is not an API compatibility target and no OpenClaw source is copied into OpenRill.

## Observed implementation boundaries

- `packages/gateway-protocol/src/version.ts` owns the protocol version range.
- `packages/gateway-protocol/src/schema/frames.ts` keeps connect, success handshake, request, response, and event envelopes as closed schemas.
- `src/gateway/server/ws-connection/message-handler.ts` enforces the first connect request, pre-auth payload budget, authentication phases, and authenticated request dispatch.
- `src/gateway/server/ws-connection.ts` owns the pre-auth handshake timer and outbound buffer guard.
- Untrusted forwarded headers are not treated as proof that a client is local.

## Problems visible in the mature reference

- The successful handshake exposes a broad feature, plugin, device, policy, and snapshot surface.
- Authentication includes several credential families and device migration paths.
- The main message handler coordinates many product-specific phases.
- The public operation/event surface has accumulated compatibility responsibilities.

## OpenRill redesign

OpenRill STEP004 retains the proven invariants but narrows the public surface:

1. A single `/protocol` loopback WebSocket endpoint.
2. One profile token credential family.
3. Closed `open`, `accepted`, `rejected`, `call`, `result`, and `notice` frames.
4. Two initial operations: `host.status` and `diagnostics.ping`.
5. A bounded in-memory notice replay window.
6. No proxy trust, remote exposure, device pairing, plugin RPC, or business database access.

The implementation is split into `UpgradePolicy`, `WebSocketCodec`, `Handshake`, `OperationRegistry`, and `NoticeWindow` instead of one product-wide handler.
