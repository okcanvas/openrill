# STEP012DR3 Windows Automation history selector prefix collision

## 이슈

```text
OR-ISSUE-076
STEP012DR3_WINDOWS_AUTOMATION_HISTORY_SELECTOR_PREFIX_COLLISION
```

## 실제 실패 명령과 증상

Windows에서 다음 명령을 실행했다.

```cmd
cd /d D:\NODE_AGENTS\okcanvas-openrill
pnpm acceptance:step012dr3
```

STEP009 focused/repeat, Vue static serving, canonical suite까지 모두 통과했고 actual Chromium Automation UI가 첫 manual run을 `SUCCEEDED`로 표시했다. 그러나 live fixture가 history row 수를 2로 판정했다.

```text
Error: Automation first history mismatch:
{"rows":2,"text":"Run historySUCCEEDEDMANUAL · attempt 1...<single run id>"}
```

최종 결과:

```text
STEP012DR3 ... checks=170/171 state=FAILED
```

## 코드로 확정한 원인

UI에는 다음 두 testid가 동시에 존재했다.

```text
automation-run-now
automation-run-<automationRunId>
```

Live fixture는 다음 prefix selector로 history row를 계산했다.

```js
document.querySelectorAll('[data-testid^="automation-run-"]').length
```

이 selector는 history row뿐 아니라 `automation-run-now` 버튼도 포함한다. 따라서 실제 ledger/history row가 1개여도 DOM count는 항상 2가 된다.

Windows evidence의 history text에는 `SUCCEEDED`, `MANUAL`, `attempt 1`, 단일 run ID만 존재했다. 또한 live fixture의 후속 SQLite 검증은 `runs.length === 1`, provider request count 1을 별도로 강제한다. 따라서 이번 `rows=2`는 두 AutomationRun 생성 증거가 아니라 testid namespace 충돌이다.

## 영향

- 정상 단일 manual run을 중복 실행으로 오판한다.
- durable replay 검증에 도달하기 전에 actual Chromium acceptance가 중단된다.
- 같은 broad prefix selector를 다른 action/row testid에 사용하면 유사한 false count가 재발할 수 있다.
- DOM count와 durable SQLite count의 의미가 섞여 진단이 혼란스러워진다.

## 수정

1. history row testid를 `automation-history-row-<id>` 전용 namespace로 변경한다.
2. actual Chromium은 `[data-testid^="automation-history-row-"]`만 집계한다.
3. `automation-run-now` action testid는 유지하되 history row selector와 겹치지 않음을 focused gate로 검사한다.
4. durable replay의 실제 중복 여부는 기존 SQLite `runs.length === 1`과 provider request count 1로 독립 검증한다.
5. 첫 run과 replay 이후 DOM row count를 모두 전용 selector로 검사한다.

## 수정 전 재현과 자동 반복 방지 gate

- 문자열 `automation-run-now`가 `/^automation-run-/`에 매치되는 것을 최소 재현한다.
- browser source는 `automation-history-row-${run.automationRunId}`를 소유해야 한다.
- live source에는 broad `[data-testid^="automation-run-"]` selector가 0건이어야 한다.
- 전용 history row selector가 첫 run/replay 두 곳에 정확히 존재해야 한다.
- live ledger의 `runs.length !== 1` 및 provider request 1 assertion을 유지한다.
- OR-ISSUE-076 detail, Registry, recurrence gate, focused 4/4, canonical suite, Windows actual Chromium이 함께 통과해야 한다.

## 종료 조건

다음 Windows marker가 통과하기 전에는 이 이슈를 live accepted로 종료하지 않는다.

```text
STEP012DR4_AUTOMATION_HISTORY_ROW_SELECTOR_ISOLATION ... state=PASSED schema=9 history_selector=ISOLATED durable_ledger=ONE_RUN browser=CHROMIUM mobile=PASS
```
