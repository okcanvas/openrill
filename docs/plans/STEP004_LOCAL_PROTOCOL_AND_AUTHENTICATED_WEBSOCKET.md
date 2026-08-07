# STEP004 — LOCAL_PROTOCOL_AND_AUTHENTICATED_WEBSOCKET

## 목적

Windows-live-accepted STEP003A 위에 OpenRill 소유의 좁고 인증된 local WebSocket protocol을 구현한다. OpenClaw protocol을 복제하지 않고, 실제 코드에서 확인한 handshake/version/auth/pre-auth/backpressure 불변조건을 더 작은 모듈 경계로 재설계한다.

## 기준선

- packaged predecessor: `STEP003A_DETERMINISTIC_NODE_TEST_REPORTER`
- version: `0.4.0-step004`
- public remote exposure: disabled
- persistence change: none

## Reference Evidence

- `OC-PROTO-001~007`: version, closed connect/success/request/response/event frame structure
- `OC-PROTO-008`: pre-auth payload limit
- `OC-PROTO-009`: first request must be handshake
- `OC-PROTO-010`: authenticated dispatch separation
- `OC-PROTO-011`: handshake timeout
- `OC-PROTO-012`: outbound buffer guard
- `OC-GW-011`: untrusted proxy headers do not create local trust

## OpenClaw 문제 분석

OpenClaw에는 실제 운영 문제의 답이 있지만 mature handshake가 plugin/device/policy/snapshot/auth migration까지 포함하고 message handler가 많은 product phase를 조정한다. OpenRill STEP004에는 이 범용성이 필요하지 않다.

## 구현 범위

### Protocol package

- `packages/protocol/src/frames.ts`
- `packages/protocol/src/validation.ts`
- closed frame and operation validation
- protocol min/max and WebSocket subprotocol

### Host transport

- `transport/upgrade-policy.ts`
- `transport/websocket-codec.ts`
- `transport/protocol-server.ts`
- `transport/operation-registry.ts`
- `transport/notice-window.ts`

### Browser boundary

- framework-neutral `apps/agent-web/src/api/local-protocol-client.ts`
- direct service/database import 없음

## 공개 계약

- endpoint `/protocol`
- subprotocol `openrill.local.v1`
- frames `open`, `accepted`, `rejected`, `call`, `result`, `notice`
- protocol version 1
- profile-token authentication
- operations `host.status`, `diagnostics.ping`

## 상태 전이

```text
HTTP_UPGRADE
  → PREAUTH
  → AUTHENTICATED
  → CLOSING
  → CLOSED

PREAUTH failure
  → rejected
  → close
```

## 실패 및 복구

- incompatible version: `PROTOCOL_MISMATCH`
- bad credential: `AUTH_FAILED`
- malformed/second pre-auth frame: `INVALID_HANDSHAKE`
- unknown operation: `OPERATION_NOT_FOUND`
- closed-schema violation: `INVALID_INPUT`
- idempotency key mismatch: `IDEMPOTENCY_CONFLICT`
- stale notice cursor: accepted snapshot with `resyncRequired=true`
- slow consumer: close code 1013

No connection or replay state survives Host restart. Business state persistence starts later.

## Acceptance

- protocol overlap and mismatch
- one closed handshake frame
- constant-time profile token
- handshake timeout and pre-auth byte limit
- direct loopback/origin policy
- untrusted proxy denied
- call correlation and closed operation schema
- idempotent replay and conflict
- monotonic notice sequence and bounded replay
- stale cursor resync
- framework-neutral browser client
- actual separate-process Host handshake/call/stop
- STEP003A and prior regressions

## 패키징 산출물

- source ZIP and SHA-256
- package manifest
- acceptance report
- OpenClaw evidence report `94/94`
- no token, runtime metadata, DB, key, or protected payload

## 제외

- remote/TLS exposure
- trusted proxies
- device pairing
- WebSocket compression and fragmentation
- public business operations
- SQLite session/event persistence
- Control UI framework selection

## 완료 선언

Deterministic and fresh-ZIP gates may declare packaged acceptance. Windows live acceptance requires the user-reported `pnpm acceptance:step004` marker.
