# OpenClaw Conversation / Transcript Ledger 코드 연구

## 연구 대상

- `src/state/openclaw-agent-schema.sql`
- `src/config/sessions/session-accessor.sqlite-transcript-store.ts`
- `src/config/sessions/session-transcript-projection-rebuild.ts`

## 확인한 설계

OpenClaw는 논리 session, transcript window, append-only transcript event, event identity/idempotency, projection index를 서로 다른 저장 구조로 분리한다. append 경로는 event identity와 message idempotency를 먼저 검사하고 다음 sequence를 할당한 뒤 event와 identity index를 같은 transaction 문맥에서 저장한다. projection rebuild는 원본 transcript event를 sequence 순서로 다시 읽고 source snapshot이 변하지 않았을 때만 결과를 게시한다.

## 문제와 OpenRill 재설계

OpenClaw schema는 channel/session/fork/delivery/ACP/trajectory까지 하나의 매우 넓은 agent DB에 축적되어 있다. OpenRill STEP006은 이 table과 API를 복사하지 않는다. Conversation, Message, AgentRun, RunAttempt, RunEvent, SubmissionIdentity, rebuildable Projection만 독립 schema v3에 추가한다. Channel delivery, model execution, approval payload, tool result body는 후속 단계로 남긴다.

## 채택한 불변조건

1. ledger event는 append-only sequence다.
2. submission과 event idempotency identity는 payload row와 분리한다.
3. projection은 삭제해도 ledger에서 재생성 가능하다.
4. crash recovery는 incomplete attempt를 명시적으로 ABORTED 처리한다.
5. workspace scope는 모든 public conversation operation에서 재검증한다.
