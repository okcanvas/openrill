# Local Protocol Security

## Admission

The upgrade is accepted only when all conditions hold:

- request path is `/protocol`;
- TCP peer is loopback;
- Host header is `localhost`, `127.0.0.1`, or `[::1]`;
- no `Forwarded`, `X-Forwarded-For`, or `X-Real-IP` header is present;
- browser Origin, when present, is a loopback origin on the actual Host port;
- WebSocket version is 13;
- subprotocol is `openrill.local.v1`.

STEP004 deliberately has no trusted-proxy mode. A proxy-connected loopback socket cannot become a trusted local client.

## Authentication

The profile token stored only in private `host.json` is supplied inside the first WebSocket frame and compared with `timingSafeEqual`. It is never accepted in a URL or query string and is not included in public status, notice, result, report, or package artifacts.

## Pre-auth hardening

Only one UTF-8 text frame is accepted before authentication. Timeout, byte budget, malformed JSON, unknown fields, incompatible protocol, and bad token all fail closed. Handshake failures use `rejected`; operation failures use `result`.

## Transport implementation

OpenRill STEP004 implements the narrow RFC 6455 server boundary needed for a local text protocol: version-13 upgrade, masked client frames, UTF-8 text, close, ping, and pong. Fragmented, binary, unmasked, RSV, oversized, and invalid UTF-8 frames are rejected. No compression extension is negotiated.

## Backpressure

Connections exceeding the outbound buffer limit are closed as slow consumers. Notice history is bounded and a stale cursor receives `resyncRequired` rather than an unbounded replay.
