# STEP012DR2 Windows background process stdout fixed-sleep race

## 이슈

```text
OR-ISSUE-075
STEP012DR2_WINDOWS_BACKGROUND_PROCESS_STDOUT_FIXED_SLEEP_RACE
```

## 실제 실패 명령과 증상

Windows에서 다음 명령을 실행했다.

```cmd
cd /d D:\NODE_AGENTS\okcanvas-openrill
pnpm acceptance:step012dr2
```

Vue static-serving focused 검증까지는 통과했지만 canonical suite에서 STEP009 background process 테스트 한 건이 실패했다.

```text
# Subtest: background process can be listed, tailed, and cancelled without EXITED overwrite
not ok 146
The input did not match the regular expression /ready/.
Input: ''
```

TAP summary는 다음이었다.

```text
tests=222
pass=221
fail=1
skipped=0
```

그 결과 actual Chromium aggregate는 실행되지 않고 다음으로 종료됐다.

```text
step012dr2-exact-vue-actual-chromium = canonical_suite_failed
STEP012DR2 ... checks=157/159 state=FAILED
```

## 코드로 확정한 원인

`ProcessManager.run(..., background=true)`의 공개 계약은 child spawn과 durable `RUNNING` 기록까지다. 첫 stdout byte가 file-backed tail에 flush될 때까지 기다린다는 계약은 없다.

기존 테스트는 다음 순서를 사용했다.

```text
background process start
→ fixed sleep 100ms
→ process.tail()
→ stdout must already contain "ready"
```

Windows에서 child startup, pipe delivery, `createWriteStream` flush가 100ms보다 늦으면 process는 정상 `RUNNING`이어도 첫 tail은 빈 문자열이다. 실제 실패의 `actual=''`이 이 경로와 일치한다.

제품 코드의 `tail()`은 현재 시점에 durable file에 기록된 byte를 bounded read하는 API이며, 미래 stdout 도착을 기다리는 API가 아니다. 따라서 고정 sleep 뒤 특정 출력이 이미 존재한다고 단정한 테스트 계약이 잘못됐다.

## 영향

- 정상 background process가 host scheduling/I/O timing 차이 때문에 canonical failure로 오판된다.
- Windows actual Chromium 검증이 제품 UI 실행 전에 차단된다.
- fixed sleep 증가만으로는 느린 CI/Windows 환경에서 같은 race가 재발한다.
- 실패 시 process status와 마지막 tail을 함께 남기지 않아 진단성이 낮다.

## 수정

1. 고정 100ms sleep을 제거한다.
2. `waitForProcessText()`가 bounded deadline 안에서 `process.tail()`을 polling한다.
3. polling 중 process가 `STARTING/RUNNING`이 아니게 되면 즉시 실패한다.
4. timeout 실패에는 마지막 process status와 tail text를 포함한다.
5. fixture는 첫 stdout을 의도적으로 250ms 지연해 과거 100ms 가정이 반드시 깨지도록 한다.
6. cancellation은 durable 상태가 동기 transaction으로 `CANCELLED`가 된 직후 검사하고 추가 timing sleep을 사용하지 않는다.

## 수정 전 재현 및 자동 반복 방지 gate

- delayed stdout fixture는 `setTimeout(..., 250)`를 사용한다.
- source gate는 `setTimeout(resolve, 100)`가 background observation block에 존재하지 않음을 검사한다.
- bounded polling helper, active-status guard, timeout evidence를 검사한다.
- STEP009 actual test file 12/12와 DR3 static gate 4/4를 함께 실행한다.
- canonical serial suite를 반복 실행해 zero failure/skip을 확인한다.
- Issue Registry, recurrence document, dedicated detail, focused gate, Windows full acceptance가 함께 존재해야 한다.

## 종료 조건

다음 Windows marker가 통과하기 전에는 이 이슈를 live accepted로 종료하지 않는다.

```text
STEP012DR3_BACKGROUND_PROCESS_OUTPUT_OBSERVATION_ALIGNMENT ... state=PASSED schema=9 process_output=BOUNDED_POLLING vendor_build=ALIGNED static_serving=BYTE_VERIFIED browser=CHROMIUM mobile=PASS
```
