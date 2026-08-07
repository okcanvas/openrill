# STEP012DR1_HOST_READY_AND_UI_BOOTSTRAP_PHASE_ALIGNMENT

## 목적

STEP012D Windows actual Chromium의 `browser wait timeout: Automation UI connected` 실패를 timeout 증가나 우회 없이 코드로 분해한다. Host가 실제 READY인 뒤에만 브라우저를 시작하고, UI bootstrap을 단계별로 노출해 transport와 projection 실패를 구분한다.

## 기준선

- official accepted baseline: `STEP012CR1_HISTORICAL_BROWSER_REGRESSION_OWNERSHIP` Windows `101/101`
- immutable accepted ZIP SHA-256: `3f2a47484f6341be98c00f189c12e2df7ec0e14e308de382d6bafddc90117062`
- failed candidate: `STEP012D_AUTOMATION_CONTROL_UI_WINDOWS_VERTICAL_SLICE` version `0.12.6-step012d`
- current revision: `STEP012DR1_HOST_READY_AND_UI_BOOTSTRAP_PHASE_ALIGNMENT` version `0.12.7-step012dr1`
- state schema: 9

## Windows 실패 증거

```text
[PASS] canonical-suite :: suite_pass
[FAIL] step012d-exact-vue-actual-chromium
Error: browser wait timeout: Automation UI connected
```

제공된 로그에는 전체 browser evidence JSON이 없으므로 실제 Windows 실행의 정확한 하위 startup phase는 추측하지 않는다.

## 코드 확인

기존 live fixture는 첫 `host.json`을 읽는 즉시 브라우저를 열었고, Host는 READY 전에 `LISTENING/readiness=false` metadata를 먼저 기록한다. UI도 bootstrap fetch, WebSocket connect, 여섯 projection load를 하나의 `FAILED` 상태로 축약했다. READY 이후 직접 Local Protocol 진단에서는 초기 여섯 operation이 모두 성공했다.

## 구현 범위

- shared Host READY metadata wait helper
- STEP011/STEP012D actual-browser fixture READY alignment
- phased UI bootstrap state
- connection state와 startup phase 분리
- browser page evidence의 startup phase
- secret-redacted bounded startup evidence
- actual Chromium wait의 CONNECTED + READY 이중 조건
- OR-ISSUE-072 문서·Registry·recurrence gate

## 공개 계약

```text
Host usable for browser
= state=READY
+ readiness=true
+ positive integer port

UI ready
= connection=CONNECTED
+ startupPhase=READY
```

Startup phase는 진단용이며 Protocol payload나 secret을 포함하지 않는다.

## 상태 전이

```text
BOOTSTRAPPING
→ FETCH_BOOTSTRAP
→ PARSE_BOOTSTRAP
→ CONNECT_PROTOCOL
→ LOAD_WORKSPACES
→ LOAD_APPROVALS
→ LOAD_ARTIFACTS
→ LOAD_AUTOMATIONS
→ LOAD_CONVERSATIONS
→ LOAD_CONVERSATION (optional)
→ LOAD_HOST_STATUS
→ READY

any phase failure → FAILED + failed-phase-prefixed alert
```

## 실패 및 복구

- Host child exit before READY: exit code와 bounded output 보존
- Host READY timeout: last metadata/read error/bounded output 보존
- browser startup timeout: Host metadata, bootstrap summary, connection/startup phase/alert를 redacted evidence로 보존
- cleanup은 기존 async quiescence와 primary failure preservation을 유지한다.

## Acceptance

- Host READY focused tests 2/2
- STEP012D UI/bootstrap focused tests 6/6
- STEP012C integration focused tests 5/5
- canonical serial suite dynamic inventory, zero fail/skip
- architecture and package exports
- exact Vue 3.5.40 acquisition/integrity
- actual Windows Chromium Automation vertical slice
- manifest pre/post unchanged
- deterministic source/fresh ZIP

Local deterministic result: `146/147`, sole missing aggregate `runtime_unavailable`; report SHA-256 `9eaab7a204edda40d6007760c51fefa73ea16bcd25b661dfb63bd688b3814bd8`.

## 반복 방지 기록

- `OR-ISSUE-072`
- `STEP012D_WINDOWS_UI_CONNECTION_WAIT_BEFORE_HOST_READY_AND_PHASE_COLLAPSE.md`
- Issue Registry와 recurrence gate 동시 갱신
- historical STEP011 actual-browser fixture도 동일 READY helper로 정렬

## 패키징 산출물

- `openrill-step012dr1-host-ready-ui-bootstrap-phase-alignment-v1.zip`
- SHA-256 sidecar
- `STEP012DR1_HOST_READY_AND_UI_BOOTSTRAP_PHASE_ALIGNMENT` acceptance report
- OR-ISSUE-072 상세 증거와 handoff 문서

## 제외

- STEP012D Automation feature 범위 변경
- 무조건적인 browser timeout 확대만으로 성공 처리
- browser evidence가 없는 상태에서 Windows 하위 실패 phase 단정
- Automation delete/backoff/active cancellation/event trigger

## 완료 선언

Focused/canonical/source/fresh 검증과 actual Windows Chromium marker가 모두 PASSED일 때만 R1을 완료한다.
