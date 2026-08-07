# ADR-0019 — Narrow Authenticated Local WebSocket

## Status

Accepted for STEP004.

## Context

The local Control UI and future local clients need an event-capable boundary that does not import Host services or storage directly. OpenClaw demonstrates protocol negotiation, closed frames, pre-auth limits, origin/proxy policy, handshake timeout, authenticated dispatch, and backpressure, but its mature protocol includes a much broader product surface.

## Decision

OpenRill owns a small protocol with `open/accepted/rejected/call/result/notice`, one profile-token credential, a closed operation registry, and bounded notice replay. The endpoint is direct-loopback only. The UI remains framework-neutral and uses the browser WebSocket API through `LocalProtocolClient`.

The Host transport is split into five independently testable parts:

1. upgrade policy;
2. RFC 6455 codec;
3. handshake/authentication;
4. operation registry/idempotency;
5. notice window/replay.

## Consequences

- No OpenClaw protocol or package compatibility is promised.
- No external WebSocket dependency is required at this stage.
- Supporting fragmentation, compression, remote TLS, trusted proxies, device pairing, or multiple credential types requires a future ADR.
- The current token bootstrap is suitable for local CLI/desktop integration; browser delivery is introduced with the Control UI serving boundary.
