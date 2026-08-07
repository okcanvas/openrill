# STEP011R3 Failed-Acceptance Report Nondeterminism

## 증상

STEP011/STEP011R3 acceptance를 같은 source와 fresh extraction에서 실행했을 때 기능 결과는 같았지만 `STEP011_ACCEPTANCE_REPORT.txt`와 `STEP011R3_ACCEPTANCE_REPORT.txt`의 SHA-256이 달라졌다.

실패 detail에 다음 실행별 값이 그대로 들어갔다.

- source/fresh absolute repository path
- 임시 vendor 디렉터리 경로
- subprocess stack path
- test duration
- dynamic loopback port
- 장문의 vendor/network failure tail

## 코드로 확인한 원인

두 acceptance runner가 실패 detail에 raw output tail을 저장했다.

```python
vendor_output[-12000:]
live_output[-16000:]
output[-24000:]
```

고정 tail은 실행 환경별 문자열을 포함할 뿐 아니라, 실제 browser evidence block의 위치를 보장하지 않는다. 특히 exact Vue prerequisite가 없는 현재 container에서는 동일한 의미의 실패가 temp path 때문에 서로 다른 report bytes를 만들었다.

## 영향

- acceptance rerun 후 package manifest가 불필요하게 변할 수 있다.
- source와 fresh-ZIP report byte identity를 증명할 수 없다.
- 실패 증거가 장문의 비결정적 tail에 묻혀 실제 prerequisite 또는 browser evidence가 불명확해진다.
- OR-ISSUE-009의 stable report 원칙이 실패 상태에는 완전히 적용되지 않았다.

## 수정

- exact Vue acquisition 실패는 실행별 network/path 문자열 대신 stable token `runtime_unavailable`로 기록한다.
- correction runner는 nested marker와 `prerequisite=runtime_unavailable`만 기록한다.
- actual Chromium 실패가 발생하면 `OPENRILL_BROWSER_EVIDENCE_BEGIN/END` block을 우선 추출한다.
- evidence의 repository root, temp path, loopback dynamic port, TAP duration은 stable placeholder로 정규화한다.
- raw fixed-tail output은 structured evidence가 없는 최후 fallback에서만 bounded 사용한다.

## 재발 방지 gate

```text
feature-vendor-failure-stable
feature-browser-failure-extractor
correction-regression-failure-stable
stable failed-acceptance evidence
source/fresh report SHA-256 equality
```

## 보존되는 정보

실제 browser failure에서는 다음 정보가 계속 남는다.

- Runtime exception
- console/log error
- failed network request 또는 HTTP failure
- safe page state
- nested STEP011 final marker

Secret, bootstrap token, private absolute path는 report에 저장하지 않는다.

## 결론

이 결함은 `OR-ISSUE-047`로 등록한다. failed acceptance도 package input이므로 의미가 같은 재실행은 byte-identical report를 생성해야 한다.
