# STEP016 — CONNECTOR_SDK_AND_MATTERMOST

## 목적

durable ingress와 Mattermost connector를 구현한다.

## Reference Evidence

- `[OC-MSG-002] src/auto-reply/dispatch.ts:746` — 채널별 입력을 공통 계약으로 투영하는 경로가 있다.
- `[OC-CHANNEL-001] src/channels/message/ingress-queue.ts:573` — 채널 ingress를 durable queue에 저장한다.
- `[OC-CHANNEL-002] src/channels/message/ingress-queue.ts:757` — claim token과 lane 차단으로 동시 처리를 제어한다.
- `[OC-CHANNEL-003] extensions/mattermost/src/mattermost/monitor.ts:63` — Mattermost monitor가 독립 provider lifecycle로 구현된다.

## 구현 범위

- `packages/connectors`
- `connectors/mattermost`

## 선행조건

- 로컬 Agent MVP와 durable Automation/Run이 닫혀 있다.
- Mattermost server test fixture 또는 실제 test instance가 준비된다.

## 구현 상세

1. Connector 공통 inbound envelope/outbound command를 정의한다.
2. durable ingress queue에 enqueue/claim/lease/ack/retry/dead-letter를 구현한다.
3. conversation routing key와 external thread mapping을 정의한다.
4. Mattermost WebSocket reconnect와 REST bootstrap/backfill을 구현한다.
5. self-message/duplicate event를 필터링한다.
6. outbound post/update/thread/file과 delivery receipt를 저장한다.
7. Connector credential은 secretRef로만 읽는다.

## 공개 계약과 불변조건

- InboundEnvelope: connector, account, externalEventId, channel/thread/sender, payload, receivedAt.
- OutboundCommand: idempotencyKey, target, thread, content, artifacts.
- Connector는 Agent Kernel을 import하지 않고 Conversation service를 호출한다.

## 상태·영속성 영향

- connector_accounts, ingress_items, external_threads, outbound_deliveries를 추가한다.

## 실패·복구 의미

- disconnect 동안 backlog를 보존하고 reconnect 후 중복 없이 처리한다.
- claim owner crash는 lease expiry 후 재처리한다.
- per-thread lane ordering을 유지한다.
- permanent outbound 오류는 dead-letter와 사용자 진단에 노출한다.

## Acceptance

- connect/auth
- initial sync boundary
- inbound dedupe
- thread routing
- lane order
- stale claim
- reconnect/backoff
- self-message filter
- outbound receipt
- retry then success
- dead-letter
- artifact upload
- secret redaction

기존 요약 gate:

- dedupe
- lane order
- stale claim
- reconnect
- outbound receipt
- thread routing

## 산출물

- connector contract/queue
- Mattermost adapter
- integration fixture
- INTEGRATED_LOCAL_AGENT_BETA gate

## 패키징 조건

- 이전 STEP 회귀 gate 통과
- source manifest와 생성 ZIP SHA-256 기록
- `HANDOFF.md`, `PLANS.md`, `VALIDATION.md` 갱신
- protected user payload, API key, Secret, runtime DB가 패키지에 포함되지 않음
- Windows live가 필요한 단계는 실제 Windows 로그 없이는 live accepted로 선언하지 않음

## 제외

- 다른 채널

## 완료 선언

모든 Acceptance와 regression이 통과한 뒤에만 `STEP016_..._PASS`를 선언한다. 정적 분석이나 mocked smoke만으로 live acceptance를 선언하지 않는다.
