# STEP010 Unsupported Profile Environment Test Isolation

## Exact symptom

전체 unit suite에서 STEP010 Host fixture의 `skill_sources` row 수가 실행 순서에 따라 기대한 1보다 커질 수 있었다. fixture는 임시 root를 만들었지만 `resolveProfilePaths`에 `OPENRILL_HOME`만 전달했다.

## Code-confirmed root cause

`packages/config`의 profile path resolver는 `OPENRILL_DATA_ROOT`와 `OPENRILL_CONFIG_ROOT`를 사용한다. `OPENRILL_HOME`은 지원되는 입력이 아니어서 무시되었고, test가 기본 사용자 profile SQLite를 공유했다.

## Impact

로컬 상태와 이전 test 실행이 다음 실행 결과에 섞여 deterministic unit gate와 개인정보 격리를 훼손할 수 있었다.

## Fix

STEP010 test는 각 fixture 전용 `OPENRILL_DATA_ROOT`와 `OPENRILL_CONFIG_ROOT`를 전달하고 종료 시 root를 제거한다.

## Recurrence-prevention gate

STEP010 acceptance는 test source 전체의 `OPENRILL_HOME` 사용 0건과 지원 environment variable 사용을 검사하고 전체 unit suite를 실행한다.
