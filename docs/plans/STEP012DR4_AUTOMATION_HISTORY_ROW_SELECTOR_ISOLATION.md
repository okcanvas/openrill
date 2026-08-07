# STEP012DR4_AUTOMATION_HISTORY_ROW_SELECTOR_ISOLATION

## 목적

STEP012DR3 Windows actual Chromium에서 정상 단일 manual AutomationRun을 `automation-run-now` action과 history row가 공유한 broad testid prefix 때문에 2행으로 오판한 acceptance 결함을 제거한다. DOM history row 관찰과 durable SQLite 중복 검증을 분리한다.

## 기준선

- official accepted baseline: `STEP012CR1_HISTORICAL_BROWSER_REGRESSION_OWNERSHIP` Windows `101/101`
- immutable accepted ZIP SHA-256: `3f2a47484f6341be98c00f189c12e2df7ec0e14e308de382d6bafddc90117062`
- failed candidate: `STEP012DR3_BACKGROUND_PROCESS_OUTPUT_OBSERVATION_ALIGNMENT` version `0.12.9-step012dr3`
- current revision: `STEP012DR4_AUTOMATION_HISTORY_ROW_SELECTOR_ISOLATION` version `0.12.10-step012dr4`
- retained feature: `STEP012D_AUTOMATION_CONTROL_UI_WINDOWS_VERTICAL_SLICE`
- state schema: 9

## 코드 확인

`[data-testid^="automation-run-"]`는 `automation-run-now` 버튼과 `automation-run-<id>` history article을 모두 선택했다. Windows text에는 단일 run만 표시됐고 SQLite exact-one gate도 별도로 존재하므로 `rows=2`는 실제 중복이 아니라 selector collision이다.

## 구현 범위

- history row testid 전용 namespace `automation-history-row-<id>`
- actual Chromium 첫 history/replay count selector 정렬
- action/row namespace 비충돌 focused 4/4
- SQLite one-run/provider-one-call durable gate 유지
- OR-ISSUE-076 상세 문서·Registry·recurrence gate
- DR3 process observation, Vue vendor/static serving, phased startup 경계 유지

## 공개 계약

```text
DOM visible history row count
= automation-history-row-* only

Durable duplicate detection
= SQLite automation_runs exact count
+ provider model request exact count
```

Action testid는 row count namespace에 포함되지 않는다.

## 상태 전이

```text
RUN_NOW
→ one history row rendered
→ durable request replay
→ same one history row retained
→ SQLite one AutomationRun
→ provider one model request
```

## 실패 및 복구

- DOM row mismatch: 전용 selector count와 history text를 보존한다.
- durable ledger mismatch: 실제 AutomationRun rows를 보존한다.
- provider duplicate: provider request count/body count를 보존한다.
- canonical failure: first TAP failure와 summary를 보존한다.
- exact Vue unavailable: `runtime_unavailable` prerequisite를 유지한다.

## Acceptance

- history selector focused 4/4
- STEP009 process/approval 12/12 and repeat 5/5
- STEP012D UI/bootstrap 6/6
- Host READY 2/2
- Vue static serving 4/4
- STEP012C integration 5/5
- canonical serial suite dynamic inventory, zero fail/skip
- exact Vue vendor-aware build and static preflight
- actual Windows Chromium Automation vertical slice
- first/replay history one row with isolated selector
- SQLite one AutomationRun and one provider request
- manifest pre/post unchanged
- deterministic source/fresh ZIP

Local deterministic result: `179/180`, sole missing aggregate `runtime_unavailable`; canonical `230/230`, unit files 42, report SHA-256 `e203e0a355f7a5e2016cc8f33936fb1b883bc886629087dd64b763efe3253948`.

## 반복 방지 기록

- `OR-ISSUE-076`
- `STEP012DR3_WINDOWS_AUTOMATION_HISTORY_SELECTOR_PREFIX_COLLISION.md`
- row/action namespace focused gate
- broad selector zero gate
- durable ledger independent gate

## 패키징 산출물

- `openrill-step012dr4-automation-history-row-selector-isolation-v1.zip`
- SHA-256 sidecar
- `STEP012DR4_ACCEPTANCE_REPORT.txt`
- OR-ISSUE-076 상세 증거
- README/HANDOFF/PLANS/ROADMAP/VALIDATION

## 제외

- 실제 중복이 확인되지 않은 scheduler/idempotency 제품 코드 변경
- history row count를 2로 허용하는 우회
- SQLite exact-one 검증 제거
- DR3/DR2/R1 corrections 완화
- Windows failure skip 처리

## 완료 선언

Focused/canonical/source/fresh 검증과 actual Windows Chromium final marker가 모두 PASSED일 때만 DR4를 완료한다.
