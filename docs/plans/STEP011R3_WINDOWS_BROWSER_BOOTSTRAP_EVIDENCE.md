# STEP011R3 — WINDOWS BROWSER BOOTSTRAP EVIDENCE

## 목적

STEP011R2 Windows `145/146` 실패에서 actual Chromium은 실행됐지만 Vue UI 연결 timeout이 `last=false`만 남긴 원인을 코드로 확정하고, 최초 navigation 이전부터 browser evidence를 수집해 다음 실패가 실제 원인과 함께 남도록 한다.

## 기준선

```text
Input candidate:
  STEP011R2_WINDOWS_CHROMIUM_EXECUTABLE_DISCOVERY_AND_SPAWN_EVIDENCE
  version=0.11.2-step011r2
  Windows=145/146 FAILED
  nested STEP011=194/195 FAILED
  failure=browser wait timeout: Vue UI connected; last=false

Output candidate:
  STEP011R3_WINDOWS_BROWSER_BOOTSTRAP_EVIDENCE
  version=0.11.3-step011r3
  schema=7
  framework=VUE_3
```

공식 accepted baseline은 STEP010AR1을 유지한다. 제공된 로그만으로 Vue/HTTP/WebSocket 중 어느 계층이 실패했는지는 확정하지 않는다.

## Windows 실패 증거

```text
[FAIL] step011-real-chromium-live
Error: browser wait timeout: Vue UI connected; last=false
STEP011_CONTROL_UI_VERTICAL_SLICE checks=194/195 state=FAILED
STEP011R2_... checks=145/146 state=FAILED
```

## 코드 확인

- Chromium process argument에 final UI URL을 전달했다.
- CDP attach와 Runtime/Log enable은 initial page navigation 이후였다.
- 초기 module/CSP/bootstrap/WebSocket 오류는 listener 생성 전에 발생할 수 있었다.
- wait helper는 마지막 boolean만 기록했다.

## 구현 범위

- `about:blank` initial browser target
- CDP attach 및 Runtime/Page/Log/Network 선행 enable
- explicit `Page.navigate`
- bounded runtime/console/log/network/dialog evidence
- safe DOM/resource snapshot
- stable evidence boundary markers
- focused evidence tests
- 기존 browser discovery, cleanup, Vue supply, Control UI flow 유지

## 공개 계약

제품 Protocol, Vue, SQLite schema, route와 operation은 변경하지 않는다. 변경 대상은 실제 browser acceptance의 관측·진단 계약이다.

```text
STEP011R3_WINDOWS_BROWSER_BOOTSTRAP_EVIDENCE
version=0.11.3-step011r3
```

## 상태 전이

```text
Chromium executable resolved
→ browser starts at about:blank
→ CDP attach
→ Runtime/Page/Log/Network enabled
→ Page.navigate(product URL)
→ CONNECTED or evidence-rich failure
```

## 실패 및 복구

- 현재 Windows 연결 실패의 제품 원인은 새 evidence 없이 추측하지 않는다.
- diagnostic entry는 64개, text는 bounded size로 제한한다.
- secrets와 private paths를 evidence에 넣지 않는다.
- 실제 Chromium과 exact Vue를 mock으로 대체하지 않는다.

## Acceptance

- focused browser evidence tests `6/6`
- canonical serial suite, skipped 0
- static pre-navigation ordering gate
- synthetic early-failure evidence gate
- nested STEP011 actual Vue/Chromium regression
- canonical suite `144/144`, `unit_files=25`
- source/fresh failed-report byte identity
- Issue Registry `OR-ISSUE-001..047`
- deterministic manifest/ZIP/fresh extraction
- runtime/protected/credential payload zero

## 반복 방지 기록

```text
OR-ISSUE-044 browser bootstrap evidence loss
OR-ISSUE-045 predicate-only browser wait diagnostic
OR-ISSUE-046 additive aggregate suite inventory drift
OR-ISSUE-047 failed-acceptance report nondeterminism
```

## 패키징 산출물

```text
openrill-step011r3-windows-browser-bootstrap-evidence-v1.zip
reference/validation/STEP011R3_ACCEPTANCE_REPORT.txt
```

## 제외

- 제공된 로그에 없는 Vue/CSP/bootstrap/WebSocket root cause 단정
- UI 기능 축소
- browser mock
- Vue 버전 변경
- unbounded page dump

## 현재 packaged candidate evidence

```text
Focused browser evidence tests = 6/6 PASSED
Canonical suite               = 144/144 PASSED
STEP011 local/fresh           = 183/195
STEP011R3 local/fresh         = 160/161
Manifest                      = 588/588 VERIFIED
STEP011 report SHA-256        = 558c6bbe02571dd6694fadb064537b507f384434432e636fc47618e860390da0
STEP011R3 report SHA-256      = 62cce03c33cde4e10ee1469e1afb92653e9d6c68e61ece87af2616c1fe5b11ba
```

유일한 미통과 aggregate는 이 container에서 exact Vue 3.5.40을 획득할 수 없어 실행되지 않은 actual Chromium full regression이다.

## 완료 선언

Windows에서 STEP011 nested `195/195`와 STEP011R3가 모두 통과해야 Windows-live accepted baseline으로 승격한다. 실패한다면 evidence block으로 실제 다음 원인을 확정한다.
