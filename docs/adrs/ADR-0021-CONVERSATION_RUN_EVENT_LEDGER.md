# ADR-0021 — Conversation / Run Event Ledger

## Status

Accepted in STEP006.

## Decision

OpenRill은 channel transcript 파일이나 OpenClaw session schema를 호환하지 않는다. Profile SQLite 안에 Conversation, immutable Message, AgentRun, RunAttempt, append-only RunEvent, submission identity, rebuildable projection을 둔다.

## Rationale

대화 표시와 실행 복구는 같은 순서·identity 증거를 사용하지만 lifecycle은 다르다. Message를 mutable chat blob으로 저장하거나 Run 상태를 transcript text에서 추론하면 idempotency, cancellation, crash recovery가 불명확해진다. 별도 ledger와 projection은 authority와 query 최적화를 분리한다.

## Consequences

- model/tool payload contract는 아직 열지 않는다.
- projection corruption은 ledger rebuild로 복구한다.
- 모든 write는 profile DB의 immediate transaction을 사용한다.
- public protocol은 workspace를 매 요청에 요구한다.
