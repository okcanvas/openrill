# STEP006 — CONVERSATION_AND_EVENT_LEDGER

## 목적

Conversation/Message/AgentRun/RunAttempt/RunEvent를 durable SQLite ledger로 구현하고 local protocol에 최소 conversation operation을 연결한다.

## 기준선

- 이전 기준선: Windows-live-accepted `STEP005_SQLITE_STATE_AND_MIGRATION_FOUNDATION`
- 현재 version: `0.6.0-step006`
- schema target: `3`

## Reference Evidence

- `[OC-STATE-001..004]` 논리 session, window, transcript event, identity index 분리
- `[OC-STATE-013]` transaction-owned append 함수
- `[OC-STATE-014]` event/message idempotency 선검사
- `[OC-STATE-015]` append 직전 sequence 할당
- `[OC-STATE-016]` authoritative event sequence 기반 projection rebuild

## OpenClaw 문제 분석

OpenClaw의 agent schema는 session routing, channel delivery, transcript tree, ACP, trajectory, search projection까지 한 영역에 포함한다. OpenRill은 이 폭을 복제하지 않고 로컬 자율형 Agent의 첫 durable execution boundary만 구현한다.

## 구현 범위

- `packages/state/migrations/003_conversation_event_ledger.sql`
- `StateConversationRepository`
- `ConversationService`
- conversation protocol input validator와 operation 5개
- Host startup recovery classifier
- protocol notices `conversation.updated`, `run.updated`

## 공개 계약

- `conversation.create`
- `conversation.list`
- `conversation.get`
- `conversation.send`
- `conversation.cancel`

각 operation은 workspaceId를 요구하며 configured workspace 밖은 `ACCESS_DENIED`다.

## 상태 전이

Conversation은 ACTIVE/ARCHIVED다. Run state와 recovery state는 `docs/contracts/CONVERSATION_LEDGER.md`를 따른다. Model execution은 없으므로 `conversation.send`는 user Message, CREATED Run, CREATED Attempt, `run.created` event까지만 원자적으로 만든다.

## 실패 및 복구

- sequence gap은 `EVENT_SEQUENCE_CONFLICT`
- submission/event key 재사용 충돌은 `CONFLICT`
- foreign workspace는 fail closed
- Host restart는 listener 이전에 active attempt를 ABORTED 처리
- checkpointed recovery 후 재실행은 ABORTED attempt를 되살리지 않고 새 attempt 생성
- projection row가 없어도 ledger에서 rebuild

## Acceptance

- create/list/get와 workspace scope
- strict message ordering
- submission replay/conflict
- event append sequence와 idempotency
- run state machine
- projection rebuild
- resumable/non-resumable restart classification
- running/terminal cancel idempotency
- authenticated WebSocket operation과 restart persistence
- STEP005 regression

## 패키징 산출물

Source-only deterministic ZIP, package manifest, SHA-256, validation report, OpenClaw evidence 104/104.

## 제외

Model call, assistant/tool message generation, approval decision, artifact, channel delivery, FTS, pagination cursor, background daemon.

## 완료 선언

`STEP006_CONVERSATION_AND_EVENT_LEDGER checks=88/88 state=PASSED schema=3 ledger=APPEND_ONLY recovery=CLASSIFIED protocol=WORKSPACE_SCOPED`만 deterministic 완료다. Windows 로그 전에는 live accepted라 하지 않는다.
