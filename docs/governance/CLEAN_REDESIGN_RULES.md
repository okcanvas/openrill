# Clean Redesign Rules

## 목적

참조 소스의 시행착오를 활용하면서 결과물이 전체/부분 포크 또는 프로토콜 clone이 되지 않게 한다.

## 허용

- subsystem과 call path 분석
- 문제·불변조건·장애 시나리오 추출
- 일반적인 패턴 채택: lifecycle phase, append-only event, durable queue, idempotency, policy gate
- source path와 symbol을 증거로 기록
- 동일 오픈소스 dependency를 독립 판단으로 선택

## 금지

- 함수/타입/테이블/설정 schema의 번역 복사
- OpenClaw RPC method와 frame shape 호환
- `openclaw.plugin.json`, `SKILL.md` 호환 loader
- OpenClaw UI route/정보 구조 복제
- source file 또는 test fixture 복사
- package 이름 alias로 사실상 OpenClaw API를 노출

## 독립성 검사

- 제품 package namespace는 `@openrill/*`
- CLI는 `openrill`
- Local Protocol frame은 `open/accepted/call/result/notice`
- Skill은 `skill.yaml + instructions.md`
- DB는 OpenRill의 Conversation/Run/ToolCall/Approval 모델
- 각 STEP acceptance는 OpenRill 요구사항만 검증

## 참조 고정

현재 참조 ZIP은 `1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82`이다. 참조 소스 버전을 바꿀 때는 새로운 audit STEP과 manifest diff가 필요하다.
