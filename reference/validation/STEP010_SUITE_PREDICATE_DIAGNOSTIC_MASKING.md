# STEP010 Suite Predicate Diagnostic Masking

## Exact symptom

Windows 실패 출력은 다음처럼 실패 detail에 실제 TAP summary 대신 `suite_pass`를 기록했다.

```text
[FAIL] build-unit-architecture-exports :: suite_pass
```

이 문자열은 suite가 전체 acceptance 계약을 만족했다는 뜻처럼 보이지만 실제 check는 실패했다.

## Code-confirmed root cause

`run_step010_acceptance.py`는 child process의 exit code만 나타내는 `ok`와 전체 marker predicate를 한 expression으로 검사했다. 그러나 detail 선택은 전체 predicate가 아니라 `ok`만 사용했다.

```python
check(..., ok and marker_contract, "suite_pass" if ok else output[-8000:])
```

Windows에서는 Node suite exit code가 0이었기 때문에 marker/count mismatch가 발생해도 actual output이 버려지고 `suite_pass`가 기록됐다.

## Impact

- 실패 로그만으로는 `pass/skipped` 수치나 누락 marker를 확인할 수 없었다.
- 사용자에게 추가 재실행을 요구하지 않고 ZIP 코드만으로 원인을 확인해야 했다.
- 이후 유사 aggregate gate에서도 exit 성공이 contract 성공으로 오인될 수 있었다.

## Fix

전체 suite predicate를 `suite_contract_ok`로 먼저 계산하고 outcome과 detail이 동일한 boolean을 사용하도록 변경했다.

```python
suite_contract_ok = ok and marker_contract
check(..., suite_contract_ok, "suite_pass" if suite_contract_ok else output[-8000:])
```

TAP 계약에 `# skipped 0`도 명시해 capability-dependent skip을 즉시 드러낸다.

## Detailed evidence

수정 전에는 process exit 0 + marker mismatch에서 failure detail이 `suite_pass`였다. 수정 후에는 동일 종류의 mismatch가 발생하면 마지막 8,000자의 실제 suite output이 acceptance report와 terminal에 남는다.

## Recurrence-prevention gate

STEP010R1 acceptance는 다음 정적·실행 gate를 유지한다.

- `suite_contract_ok` 단일 predicate
- outcome과 detail이 같은 predicate를 사용
- `"suite_pass" if ok else` 패턴 0
- TAP `tests/pass/fail/skipped` 명시 검증
- focused test 및 full STEP010 regression 실행
