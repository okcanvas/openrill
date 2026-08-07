# Connector Contract

OpenClaw의 projected dispatcher와 durable ingress queue는 채널 코드와 Agent 코드를 분리한다: `[OC-MSG-002] src/auto-reply/dispatch.ts:746`, `[OC-CHANNEL-001] src/channels/message/ingress-queue.ts:573`, `[OC-CHANNEL-002] src/channels/message/ingress-queue.ts:757`. Mattermost는 별도 monitor lifecycle이다: `[OC-CHANNEL-003] extensions/mattermost/src/mattermost/monitor.ts:63`.

## OpenRill Connector 역할

- external event normalize
- stable event key/deduplication
- lane key 계산
- durable enqueue/claim/retry/dead-letter
- common inbound command 생성
- outbound delivery와 receipt 저장
- reconnect/backoff/doctor

Connector는 모델 실행 함수를 직접 호출하지 않는다. Host의 `InboundCommandService`만 호출한다.
