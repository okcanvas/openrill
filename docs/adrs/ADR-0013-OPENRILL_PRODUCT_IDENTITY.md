# ADR-0013: OpenRill Product Identity

- Status: Accepted
- Date: 2026-08-01

## Context

초기 참조 재설계 문서는 로컬 제품을 임시 명칭으로 기록했다. 구현을 시작하기 전에 저장소, CLI, package, config, 환경변수와 사용자 데이터 경로를 하나의 독립 브랜드로 고정해야 한다.

## Decision

로컬 자율형 에이전트의 공식 프로젝트명은 `OpenRill`이다.

- repository: `openrill`
- CLI: `openrill`
- package scope: `@openrill/*`
- config: `openrill.yaml`
- environment prefix: `OPENRILL_`
- local data/config root: `OpenRill` 또는 `openrill`

별도 서버 제품명 `OKCanvas Agent Runtime`은 유지한다. OpenClaw는 계속 참조 프로젝트로만 취급한다.

## Consequences

- STEP001부터 모든 production identifier는 OpenRill 명칭을 사용한다.
- 이전 임시 명칭에 대한 runtime compatibility alias는 만들지 않는다. 아직 제품 코드와 사용자 데이터가 없기 때문이다.
- 이름 변경이 참조 evidence의 path, excerpt 또는 source identity를 수정해서는 안 된다.
- package manifest와 acceptance에서 금지된 이전 식별자를 검사한다.
