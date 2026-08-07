# OpenClaw Config Code Reading

## 확인한 실제 경계

- `createConfigIO`가 context와 load/read/write/recovery 기능을 한 factory 경계로 묶는다. `[OC-CONFIG-001]`
- load는 source read, include/env resolution, migration, validation, observation을 조정한다. `[OC-CONFIG-002]`
- write는 별도 함수에서 base snapshot, validation, safety, audit와 commit을 처리한다. `[OC-CONFIG-003]`
- include는 별도 guard와 allowed root를 사용한다. `[OC-CONFIG-004]`
- env substitution은 암묵 문자열 치환이 아니라 명시 문법과 missing warning을 갖는다. `[OC-CONFIG-005]`
- 미래 binary가 작성한 config를 older binary가 파괴적으로 쓰지 않도록 guard한다. `[OC-CONFIG-006]`
- optimistic write는 base snapshot이 여전히 현재인지 commit 전 재검사한다. `[OC-CONFIG-007]`
- 실제 commit은 `replaceFileAtomic` 경계에 위임한다. `[OC-CONFIG-008]`
- last-known-good artifact는 source와 별도 경로로 유지된다. `[OC-CONFIG-009]`
- SecretRef는 source/provider/id grammar를 공유한다. `[OC-CONFIG-010]`
- config snapshot redaction이 별도 함수다. `[OC-CONFIG-011]`
- backup rotation·permission hardening이 별도 유지보수 함수다. `[OC-CONFIG-012]`

## 확인한 문제

OpenClaw config는 오랜 호환성, plugin/channel schema, JSON5 comments, env substitution 복원, migration, runtime refresh rollback, audit, suspicious clobber recovery가 한 제품에서 누적됐다. 각 기능의 이유는 유효하지만 신규 OpenRill v1에 그대로 가져오면 config core가 너무 일찍 비대해진다.

## OpenRill 채택

- load/write/snapshot/recovery 분리
- include containment와 bounded graph
- optimistic revision
- atomic replace와 post-commit 검증
- LKG
- SecretRef와 redacted diagnostics
- future-version fail closed

## OpenRill 변경

- OpenClaw JSON5/API/config key와 호환하지 않는다.
- env 문자열 치환을 지원하지 않고 typed SecretRef를 사용한다.
- plugin-defined schema를 core v1에 병합하지 않는다.
- YAML 전체가 아니라 closed safe subset을 소유한다.
- parse/schema 손상만 LKG 복구하며 include policy/future version은 자동 복구하지 않는다.
- source·materialized·LKG·journal의 위치와 계약을 독립적으로 정의한다.
