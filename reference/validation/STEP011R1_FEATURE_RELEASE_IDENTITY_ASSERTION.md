# STEP011R1 feature and release identity assertion

## 발견

첫 STEP011R1 acceptance에서 cleanup helper와 모든 static/unit gate가 통과했지만 nested STEP011 regression은 다음 두 건을 실패했다.

```text
[FAIL] package-manifest-generator-step
[FAIL] package-manifest-verifier-step
```

Generated manifest 자체는 다음 올바른 current release identity로 통과했다.

```text
STEP011R1_WINDOWS_SQLITE_WAL_CLEANUP_AND_FAILURE_PRESERVATION
0.11.1-step011r1
```

## 정확한 원인

`run_step011_acceptance.py`는 browser feature marker용 `STEP` 상수와 package release identity를 동일하게 사용했다.

```text
feature identity: STEP011_CONTROL_UI_VERTICAL_SLICE
release identity: STEP011R1_WINDOWS_SQLITE_WAL_CLEANUP_AND_FAILURE_PRESERVATION
```

Correction release에서도 feature marker는 STEP011이어야 하지만 manifest owner는 STEP011R1이어야 한다. 이 둘을 구분하지 않아 올바른 generator/verifier를 실패 처리했다.

## 수정

```python
STEP = "STEP011_CONTROL_UI_VERTICAL_SLICE"
RELEASE_STEP = "STEP011R1_WINDOWS_SQLITE_WAL_CLEANUP_AND_FAILURE_PRESERVATION"
```

- final browser feature marker는 `STEP` 사용
- manifest generator/verifier와 generated identity는 `RELEASE_STEP` 사용

## 재발 방지

STEP011R1 acceptance는 다음을 동시에 검사한다.

- STEP011 feature marker 유지
- generator/verifier current release identity
- generated manifest current release identity
- nested full browser regression
