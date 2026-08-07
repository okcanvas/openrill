# ADR-0017: Config Source, Snapshot, and Secret Reference Boundary

- Status: Accepted
- Date: 2026-08-01
- Step: STEP003

## Context

로컬 자율형 Agent는 사용자가 편집하는 설정, Host가 실제로 적용한 설정, 복구 가능한 마지막 정상 설정, Secret 실제 값을 한 파일에 혼합하면 안 된다. OpenClaw는 config IO factory, load/write 분리, guarded include, atomic replacement, last-known-good, SecretRef grammar와 redacted snapshot을 실제 코드로 분리한다. `[OC-CONFIG-001]`~`[OC-CONFIG-012]`.

OpenRill은 OpenClaw의 JSON5 schema·plugin config·환경 치환 계약을 호환하지 않는다. 더 작은 closed v1 계약을 소유한다.

## Decision

1. 사용자 source는 `<configRoot>/agent.yaml` 하나다.
2. YAML은 OpenRill이 문서화한 안전 subset만 지원한다. anchor, alias, tag, merge key, multi-document, block scalar는 거부한다.
3. Runtime materialized snapshot과 last-known-good는 `<dataRoot>/config/`에 분리한다.
4. include는 config root 내부 상대 경로만 허용하고 lexical path와 realpath 모두 containment를 검사한다.
5. source graph hash와 materialized canonical hash를 별도로 유지한다.
6. config write는 profile별 mutation lock, expected revision, temp write, fsync, rename, post-commit reload를 통과해야 한다.
7. parse/schema 오류만 LKG 복구 대상이다. include escape/cycle/limit와 future version은 fail closed한다.
8. Secret은 `{kind, key}` reference로만 source/snapshot/journal에 존재한다. 실제 값은 point-of-use에서만 해석한다.
9. CLI `config show`는 항상 redacted materialized config만 출력한다.
10. OS keychain concrete adapter는 STEP003 범위 밖이다.

## Consequences

- config source가 손상돼도 마지막 정상 materialized config로 Host를 시작할 수 있다.
- include file 변경도 source graph revision을 변경하므로 optimistic write가 감지한다.
- literal API key를 schema가 허용하지 않는다.
- 완전한 YAML 호환성보다 결정성·보안·진단 가능성을 우선한다.
- future schema migration은 별도 STEP/ADR 없이 자동 수행하지 않는다.
