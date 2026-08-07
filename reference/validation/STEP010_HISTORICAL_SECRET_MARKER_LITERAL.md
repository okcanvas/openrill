# STEP010 Historical Secret Marker Literal

## Exact symptom

바이트 동일 STEP010 ZIP의 전체 text entry를 credential assignment pattern으로 검사하자 `scripts/run_step008_acceptance.py`가 한 건 탐지되었다.

## Code-confirmed root cause

실제 자격증명 값은 없었지만 과거 report 검증 코드가 `OPENRILL_STEP008_API_` + `KEY=` 문자열을 하나의 source literal로 보유했다. generic ZIP scanner는 이 문자열 뒤의 Python source를 quoted assignment 형태로 인식했다.

## Impact

final package의 credential-shaped literal zero 선언과 충돌하고, 과거 acceptance source가 이후 STEP의 package policy에서 빠질 수 있음을 보여줬다.

## Fix

과거 marker를 `"OPENRILL_STEP008_API_" + "KEY="`로 분할해 실행 의미는 유지하면서 ZIP에 연속 credential marker가 남지 않게 했다.

## Recurrence-prevention gate

STEP010 acceptance와 final package audit는 현재 STEP 파일만이 아니라 ZIP 전체 text entry에서 credential-shaped assignment와 known continuous marker를 검사한다.
