# STEP017 — NARROW_EXTENSION_SDK

## 목적

검증된 extension manifest와 네 종류 registrar를 구현한다.

## Reference Evidence

- `[OC-PLUGIN-001] src/plugins/discovery.ts:1402` — 플러그인 탐색이 별도 보안 경계를 갖는다.
- `[OC-PLUGIN-002] src/plugins/manifest.ts:27` — 플러그인 manifest 파일명이 고정되어 있다.
- `[OC-PLUGIN-003] src/plugins/manifest.ts:199` — manifest에 configSchema를 강제한다.
- `[OC-PLUGIN-004] src/plugins/plugin-api.types.ts:168` — 플러그인 API가 많은 확장 표면을 통합한다.

## 구현 범위

- `packages/extension-sdk`

## 선행조건

- Provider/Tool/SkillSource/Connector 내부 계약이 실제 구현으로 검증되었다.

## 구현 상세

1. 확장 manifest와 package entry discovery를 정의한다.
2. 등록 가능한 surface를 Provider, Tool, SkillSource, Connector 네 종류로 닫는다.
3. manifest schema, version compatibility, capability declaration을 검증한다.
4. 사용자 allowlist와 profile별 enable/disable을 구현한다.
5. activation은 staging registry에 등록한 뒤 전부 성공할 때 commit한다.
6. failure 시 부분 registrar와 side effect를 rollback한다.
7. 임의 protocol operation/UI route/DB migration 등록을 금지한다.

## 공개 계약과 불변조건

- manifest: id, version, apiVersion, entry, capabilities, configSchema.
- registrar는 explicit disposable handle을 반환한다.
- 확장 config는 core config namespace와 충돌할 수 없다.

## 상태·영속성 영향

- extension install metadata, enabled revision, activation diagnostics를 저장한다.

## 실패·복구 의미

- path escape/symlink entry/duplicate id/API mismatch를 거부한다.
- activation exception이 Host 전체 READY를 무조건 막지 않되 required extension은 실패시킨다.
- reload 중 기존 활성 버전은 새 버전 commit 전 유지한다.

## Acceptance

- valid manifest
- unknown key
- entry containment
- duplicate id
- API range mismatch
- allowlist
- successful registrar
- partial failure rollback
- reload atomic
- disable dispose
- no arbitrary RPC/UI/DB

기존 요약 gate:

- manifest schema
- path ownership
- activation allowlist
- failure rollback
- no arbitrary RPC/UI

## 산출물

- narrow extension SDK
- sample extension fixtures
- activation diagnostics
- STEP017 acceptance

## 패키징 조건

- 이전 STEP 회귀 gate 통과
- source manifest와 생성 ZIP SHA-256 기록
- `HANDOFF.md`, `PLANS.md`, `VALIDATION.md` 갱신
- protected user payload, API key, Secret, runtime DB가 패키지에 포함되지 않음
- Windows live가 필요한 단계는 실제 Windows 로그 없이는 live accepted로 선언하지 않음

## 제외

- OpenClaw plugin compatibility

## 완료 선언

모든 Acceptance와 regression이 통과한 뒤에만 `STEP017_..._PASS`를 선언한다. 정적 분석이나 mocked smoke만으로 live acceptance를 선언하지 않는다.
