# STEP020 — RELEASE_ACCEPTANCE

## 목적

clean install부터 upgrade/recovery까지 release gate를 닫는다.

## Reference Evidence

- `[OC-TEST-001] src/gateway/server-import-boundary.test.ts:91` — Gateway facade/import boundary를 테스트한다.
- `[OC-TEST-002] test/scripts/sqlite-session-schema-baseline.test.ts:18` — SQLite session schema baseline을 테스트한다.
- `[OC-TEST-003] src/gateway/server/ws-connection.startup.test.ts:26` — 동시 connect race를 회귀 테스트한다.

## 구현 범위

- `installer`
- `release scripts`
- `acceptance matrix`

## 선행조건

- STEP001~019 packaged baseline과 Windows live evidence가 모두 존재한다.

## 구현 상세

1. clean machine installation부터 first-run config, model setup, workspace, conversation, tool, approval, automation, browser까지 walkthrough를 자동화한다.
2. crash/restart, DB upgrade, backup/restore, connector reconnect를 release matrix로 실행한다.
3. installer/update/uninstall의 preserve/delete user-data 선택을 검증한다.
4. SBOM/license/third-party notice와 artifact SHA/signature를 생성한다.
5. product version, config version, protocol version, DB schema version compatibility 표를 고정한다.
6. fresh ZIP/installer에서 source tree 오염과 Secret 포함 여부를 검사한다.

## 공개 계약과 불변조건

- Release manifest: product version, commit/source hash, artifact hashes, schema/protocol/config compatibility, test evidence.
- 지원 환경과 known limitation을 명시한다.
- 서버용 OKCanvas Agent Runtime integration은 별도 connector release로 남긴다.

## 상태·영속성 영향

- release evidence는 immutable artifact로 보존한다.

## 실패·복구 의미

- 하나의 필수 live scenario라도 실패하면 release-ready를 선언하지 않는다.
- upgrade/rollback이 user state를 훼손하면 즉시 block한다.
- uninstall preserve/delete 결과가 선택과 다르면 실패한다.

## Acceptance

- clean install
- first-run
- interactive workflow
- approval workflow
- automation workflow
- browser workflow
- crash recovery
- DB/config upgrade
- backup restore
- Mattermost reconnect
- daemon restart
- update rollback
- uninstall preserve
- uninstall delete
- secret scan
- SBOM/license
- artifact hash reproducibility

기존 요약 gate:

- clean machine
- MVP walkthrough
- crash recovery
- backup restore
- upgrade
- uninstall preserve/delete

## 산출물

- installer/release archive
- release manifest/SBOM/notices
- full acceptance report
- `DISTRIBUTABLE_LOCAL_AGENT_V1` declaration

## 패키징 조건

- 이전 STEP 회귀 gate 통과
- source manifest와 생성 ZIP SHA-256 기록
- `HANDOFF.md`, `PLANS.md`, `VALIDATION.md` 갱신
- protected user payload, API key, Secret, runtime DB가 패키지에 포함되지 않음
- Windows live가 필요한 단계는 실제 Windows 로그 없이는 live accepted로 선언하지 않음

## 제외

- 서버 Runtime 통합

## 완료 선언

모든 Acceptance와 regression이 통과한 뒤에만 `STEP020_..._PASS`를 선언한다. 정적 분석이나 mocked smoke만으로 live acceptance를 선언하지 않는다.
