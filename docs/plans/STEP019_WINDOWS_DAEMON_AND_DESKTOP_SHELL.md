# STEP019 — WINDOWS_DAEMON_AND_DESKTOP_SHELL

## 목적

Windows background service와 desktop shell을 결정·구현한다.

## Reference Evidence

- `[OC-OPS-001] src/daemon/schtasks.ts:8` — Windows Scheduled Tasks backend가 있다.
- `[OC-CLI-002] openclaw.mjs:141` — 런처가 자식 프로세스 respawn과 signal 전달을 소유한다.

## 구현 범위

- `packages/platform-windows`
- `apps/desktop`

## 선행조건

- foreground Host와 update/doctor가 Windows live accepted다.
- Desktop shell 필요성을 browser UI 사용성 결과로 재평가한다.

## 구현 상세

1. Windows Scheduled Task 기반 auto-start/service wrapper를 구현한다.
2. 경로/인자/quote/profile 이름을 안전하게 escaping한다.
3. install/status/start/stop/uninstall과 drift detection을 구현한다.
4. 로그온 전후, 사용자 권한, sleep/resume, upgrade restart를 테스트한다.
5. Desktop shell을 Tauri/Electron 중 실제 요구와 packaging 검증으로 선택한다.
6. custom URI/deep link는 allowlist된 local route만 열게 한다.
7. foreground와 daemon이 동일 profile에서 충돌하지 않게 한다.

## 공개 계약과 불변조건

- service definition은 executable path, args, working dir, profile, version hash를 기록한다.
- daemon status는 task 존재와 실제 Host readiness를 구분한다.
- desktop shell은 Host process owner가 아니라 lifecycle client로 시작한다.

## 상태·영속성 영향

- service install metadata와 desktop preference를 profile state에 둔다.

## 실패·복구 의미

- schtasks quoting 오류/권한 거부/삭제된 executable/drift를 진단한다.
- upgrade 중 Host가 재시작되지 않으면 rollback 또는 foreground recovery 절차를 제공한다.
- deep link 외부 URL/명령 injection을 거부한다.

## Acceptance

- install task
- unicode/space path
- login start
- status ready distinction
- stop
- uninstall
- definition drift
- sleep/resume
- upgrade restart
- foreground conflict
- desktop reconnect
- deep-link allow/deny

기존 요약 gate:

- schtasks quoting
- login start
- stop
- service drift
- upgrade restart
- native deep link

## 산출물

- Windows platform package
- daemon CLI
- desktop shell decision/implementation
- STEP019 live acceptance

## 패키징 조건

- 이전 STEP 회귀 gate 통과
- source manifest와 생성 ZIP SHA-256 기록
- `HANDOFF.md`, `PLANS.md`, `VALIDATION.md` 갱신
- protected user payload, API key, Secret, runtime DB가 패키지에 포함되지 않음
- Windows live가 필요한 단계는 실제 Windows 로그 없이는 live accepted로 선언하지 않음

## 제외

- macOS/Linux service parity

## 완료 선언

모든 Acceptance와 regression이 통과한 뒤에만 `STEP019_..._PASS`를 선언한다. 정적 분석이나 mocked smoke만으로 live acceptance를 선언하지 않는다.
