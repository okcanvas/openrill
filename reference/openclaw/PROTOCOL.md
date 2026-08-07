# Protocol

관찰: protocol range, connect/hello, req/res/event schema, lightweight guard: `[OC-PROTO-001] packages/gateway-protocol/src/version.ts:2`~`[OC-PROTO-007] packages/gateway-protocol/src/frame-guards.ts:37`.

채택: version negotiation, closed schemas, capability negotiation, event sequence.

변경: frame 이름과 operation catalog를 새로 설계하며 OpenClaw protocol 호환을 하지 않는다.
