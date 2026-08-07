# ADR-0026 — Immutable Skill Run Snapshot

## Status

Accepted for `STEP010_SKILL_DISCOVERY_AND_RUN_SNAPSHOT`.

## Context

Skill source는 bundled, managed-user, Workspace에서 실행 중 변경될 수 있다. 매 Model turn에 원본을 다시 읽으면 같은 Run의 instructions와 resources가 바뀌고, 재시작 후에도 과거 실행을 재현할 수 없다.

## Decision

1. discovery는 strict `skill.yaml` metadata와 diagnostics만 만든다.
2. source precedence는 `BUNDLED < MANAGED_USER < WORKSPACE`로 고정한다.
3. activation은 current user message와 explicit hints의 deterministic match다.
4. 선택된 Skill content는 Run 최초 resolution 때 private snapshot directory로 복사한다.
5. `skill_run_contexts`가 selected IDs와 catalog hash를 고정한다.
6. 같은 Run의 재개는 source를 재탐색하지 않고 snapshot ledger/file을 검증해 사용한다.
7. 모든 file은 UTF-8, bounded, root-contained regular file이어야 한다.
8. 원본이 삭제되어도 durable snapshot이 존재하는 과거 Run은 해석 가능해야 한다.

## Consequences

- Run 재현성과 승인 재개 일관성이 높아진다.
- source 변경은 다음 Run부터 적용된다.
- private state 사용량이 증가하므로 file/total size bound가 필요하다.
- source catalog와 snapshot content 사이 변경은 fail closed한다.

## Rejected

- 매 turn source re-read
- DB에 instructions/resource bytes 직접 저장
- OpenClaw `SKILL.md` 호환 parser
- Skill executable code와 dynamic dependency
