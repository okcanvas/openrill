# STEP011R3 Additive Unit Count Drift

## 증상

STEP011R3에서 `browser-page-evidence-step011r3.test.mjs`를 추가한 뒤 canonical suite는 실제로 다음과 같이 통과했다.

```text
# tests 144
# pass 144
# fail 0
# skipped 0
OPENRILL_STEP001_SUITE_PASS unit_files=25 reporter=TAP concurrency=1
```

그러나 `scripts/run_step011_acceptance.py`는 이전 STEP011R2 시점의 값을 계속 요구했다.

```text
# tests 138
# pass 138
unit_files=24
```

그 결과 canonical suite process가 성공해도 `build-unit-architecture-exports`가 실패했다.

## 코드로 확인한 원인

STEP011 feature acceptance가 canonical runner의 현재 inventory를 읽거나 현재 marker를 갱신하지 않고, 이전 additive test inventory의 숫자를 직접 보유했다. 새 test file 1개와 test 6개가 추가되어 실제 inventory가 `24/138 → 25/144`로 증가했지만 owner assertion이 함께 갱신되지 않았다.

이 문제는 product, Vue runtime 또는 Chromium 실패가 아니다. acceptance의 static success predicate가 현재 canonical suite 출력과 불일치한 문제다.

## 영향

- exact Vue가 없어도 실행 가능한 canonical build/unit/architecture/export 검사가 잘못 실패했다.
- vendor prerequisite 실패와 독립 suite 실패가 하나의 nested regression 실패로 섞였다.
- source와 fresh ZIP에서 동일한 제품 코드가 acceptance orchestration 때문에 불안정하게 보일 수 있었다.

## 수정

- STEP011 feature acceptance의 canonical inventory를 실제 runner 결과에 맞춰 `144 tests`, `25 files`로 정렬했다.
- STEP011R3 acceptance가 feature acceptance source에 현재 inventory marker가 존재하는지 검사한다.
- canonical suite는 Vue vendor 획득 성공 여부와 무관하게 별도로 실행되고 판정된다.

## 재발 방지 gate

```text
feature-suite-tests-current
feature-suite-files-current
build-unit-architecture-exports
```

전체 serial suite 자체도 다음 marker를 계속 소유한다.

```text
OPENRILL_STEP001_SUITE_PASS unit_files=25 reporter=TAP concurrency=1
```

## 결론

이 결함은 `OR-ISSUE-046`으로 등록한다. additive test inventory 변경 시 aggregate acceptance의 owner predicate도 함께 변경되고 fresh-ZIP에서 재검증되어야 한다.
