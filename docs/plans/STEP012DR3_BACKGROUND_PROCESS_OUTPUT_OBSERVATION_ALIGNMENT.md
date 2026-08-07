# STEP012DR3_BACKGROUND_PROCESS_OUTPUT_OBSERVATION_ALIGNMENT

## 목적

STEP012DR2 Windows canonical suite에서 정상 background process의 첫 stdout이 100ms 안에 관찰된다고 가정해 발생한 비결정적 실패를 제거한다. Product `process.tail`의 현재-byte 계약을 변경하지 않고 테스트 관찰을 bounded polling으로 정렬한 뒤, DR2의 vendor-aware build/static serving/actual Chromium 경계를 그대로 재검증한다.

## 기준선

- official accepted baseline: `STEP012CR1_HISTORICAL_BROWSER_REGRESSION_OWNERSHIP` Windows `101/101`
- immutable accepted ZIP SHA-256: `3f2a47484f6341be98c00f189c12e2df7ec0e14e308de382d6bafddc90117062`
- failed candidate: `STEP012DR2_VUE_VENDOR_BUILD_AND_STATIC_SERVING_ALIGNMENT` version `0.12.8-step012dr2`
- current revision: `STEP012DR3_BACKGROUND_PROCESS_OUTPUT_OBSERVATION_ALIGNMENT` version `0.12.9-step012dr3`
- retained feature: `STEP012D_AUTOMATION_CONTROL_UI_WINDOWS_VERTICAL_SLICE`
- state schema: 9

## 코드 확인

`ProcessManager.run(background=true)`는 spawn과 RUNNING ledger를 반환한다. stdout flush 완료는 반환 계약이 아니다. 기존 STEP009 test는 fixed 100ms sleep 후 `tail()`이 반드시 `ready`를 포함한다고 가정했다. Windows evidence는 RUNNING process의 첫 tail이 빈 문자열일 수 있음을 증명했다.

## 구현 범위

- STEP009 background stdout fixed sleep 제거
- bounded `waitForProcessText()` polling helper
- active status guard와 timeout status/tail evidence
- first stdout 250ms delayed deterministic fixture
- cancellation 후 불필요한 fixed sleep 제거
- OR-ISSUE-075 상세 문서, Registry, recurrence gate
- DR3 focused 4/4 static gate + STEP009 12/12 actual test
- DR2 vendor-aware build/static-serving/Chromium 경계 유지

## 공개 계약

```text
ProcessManager.run(background=true)
= child spawned + durable RUNNING
!= first stdout already flushed

Output observation success
= bounded polling before deadline
+ process remains STARTING/RUNNING until match
+ expected text appears in durable tail
```

## 상태 전이

```text
START_BACKGROUND
→ RUNNING ledger
→ POLL_TAIL(status + text)
→ expected text observed
→ CANCEL
→ durable CANCELLED
```

고정 wall-clock sleep 하나로 stdout readiness를 추론하지 않는다.

## 실패 및 복구

- deadline timeout: expected text, timeout, final status, final tail을 보존한다.
- early terminal process: terminal status와 final tail로 즉시 실패한다.
- process/tail error: 실제 Tool result를 assertion evidence로 보존한다.
- canonical failure: first `not ok` TAP block과 summary를 보존한다.
- Vue unavailable: 기존 `runtime_unavailable` prerequisite 분류를 유지한다.

## Acceptance

- background observation static focused 4/4
- STEP009 process/approval actual focused 12/12
- STEP012D UI/bootstrap focused 6/6
- Host READY focused 2/2
- Vue static serving focused 4/4
- STEP012C integration 5/5
- canonical serial suite dynamic inventory, zero fail/skip
- repeated canonical/process focused runs
- architecture and exports
- exact Vue acquisition, vendor-aware build, Host HTTP byte preflight
- actual Windows Chromium Automation vertical slice
- manifest pre/post unchanged
- deterministic source/fresh ZIP

Local deterministic result: `170/171`, sole missing aggregate `runtime_unavailable`; canonical `226/226`, unit files 41, report SHA-256 `5b51a53ef3b77f52e306d2ea7e5ed493a46a65c4d87dd00939f6943836525035`.

## 반복 방지 기록

- `OR-ISSUE-075`
- `STEP012DR2_WINDOWS_BACKGROUND_PROCESS_STDOUT_FIXED_SLEEP_RACE.md`
- delayed-first-output fixture
- fixed-sleep-zero static gate
- bounded status/tail evidence gate
- Registry와 recurrence gate 동시 갱신

## 패키징 산출물

- `openrill-step012dr3-background-process-output-observation-alignment-v1.zip`
- SHA-256 sidecar
- `STEP012DR3_ACCEPTANCE_REPORT.txt`
- OR-ISSUE-075 상세 증거
- README/HANDOFF/PLANS/ROADMAP/VALIDATION

## 제외

- ProcessManager background run이 첫 stdout까지 blocking하도록 제품 계약 변경
- fixed sleep을 더 큰 값으로 단순 증가
- Windows 실패를 skip 처리
- DR2 Vue vendor/static serving 검증 완화
- Automation 기능 범위 변경

## 완료 선언

Focused/canonical/source/fresh 검증과 actual Windows Chromium marker가 모두 PASSED일 때만 DR3를 완료한다.
