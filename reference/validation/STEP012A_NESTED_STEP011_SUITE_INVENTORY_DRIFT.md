# STEP012A Nested STEP011 Suite Inventory Drift

## 실제 증상

STEP012A focused test와 canonical suite는 다음과 같이 성공했다.

```text
focused=14/14 PASSED
canonical=176/176 PASSED
unit_files=31
fail=0
skipped=0
```

그러나 `python scripts/run_step011_acceptance.py`의 nested result는 다음 항목을 실패로 기록했다.

```text
[FAIL] build-unit-architecture-exports
STEP011_CONTROL_UI_VERTICAL_SLICE ... state=FAILED
```

보고서 detail에는 실제 `not ok` assertion이 아니라 process PID와 `duration_ms`가 포함된 정상 TAP tail이 들어가 반복 실행마다 report SHA가 달라졌다.

## 코드로 확정한 원인

`run_step011_acceptance.py`는 current package의 canonical suite를 실행하면서 성공 조건을 다음 중간 inventory에 고정했다.

```text
# tests 174
# pass 174
unit_files=31
```

STEP012A에서 disabled-past one-shot과 cron Sunday 7 회귀를 추가해 실제 canonical count가 176으로 증가했지만 nested runner literal은 갱신되지 않았다. OR-ISSUE-046의 기존 gate는 당시 STEP011 feature owner의 숫자 정렬만 검사했으며, 이후 STEP이 실행하는 active historical nested runner 전체를 포괄하지 못했다.

## 영향

- 모든 제품/unit/architecture/export 검증이 성공해도 nested STEP011이 실패한다.
- exact Vue prerequisite와 무관한 허위 실패가 추가된다.
- 정상 TAP tail의 PID와 duration이 acceptance report에 저장되어 source/fresh report 결정성을 깨뜨린다.

## 수정

Nested STEP011 runner는 다음을 계산한다.

```text
current_unit_files = count(tests/unit/*.test.mjs)
TAP tests == TAP pass
fail == 0
skipped == 0
unit_files marker == current_unit_files
current tests >= STEP012A accepted floor 176
```

과거 고정값 `174`는 제거했다. 최소 floor는 테스트 삭제를 막고, dynamic equality는 이후 additive test가 historical browser regression을 허위 실패시키지 않게 한다.

## 자동 recurrence-prevention gate

STEP012A acceptance는 다음 source contract를 검사한다.

- nested runner가 current unit-file glob을 계산한다.
- TAP tests/pass 값을 캡처해 동일성을 검사한다.
- current floor 176을 검사한다.
- literal `# tests 174`와 `# pass 174`가 존재하지 않는다.

이 이슈는 `OR-ISSUE-056`으로 등록한다.
