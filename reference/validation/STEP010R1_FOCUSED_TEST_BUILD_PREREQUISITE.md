# STEP010R1 Focused Test Build Prerequisite

## Exact symptom

첫 STEP010R1 deterministic acceptance에서 repair-specific static gates는 모두 통과했지만 focused Skill test가 다음 오류로 실패했다.

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'packages/config/dist/index.js'
STEP010R1_WINDOWS_SYMLINK_CAPABILITY_AND_SUITE_DIAGNOSTICS checks=111/112 state=FAILED
```

같은 실행의 뒤쪽 `step010-full-regression`은 자체 build를 수행해 통과했다.

## Code-confirmed root cause

`run_step010r1_acceptance.py`는 시작 시 공통 `clean()`으로 모든 workspace `dist`를 제거했다. 그 직후 `tests/unit/skills-step010.test.mjs`를 직접 실행했지만, 이 test는 `packages/*/dist/index.js`와 `services/agent-host/dist/index.js`를 import한다. focused test 앞에 workspace build가 없었다.

## Impact

- source ZIP 또는 fresh extraction처럼 generated output이 없는 정상 환경에서 STEP010R1 gate가 항상 실패했다.
- 개발 작업 디렉터리에 우연히 남은 dist가 있으면 통과할 수 있어 acceptance가 환경 잔여물에 의존할 수 있었다.
- 제품 회귀 결과와 repair-specific focused result가 불필요하게 달라졌다.

## Fix

focused Skill test 직전에 다음 deterministic build를 실행한다.

```text
node scripts/workspace-runner.mjs build
```

build와 focused TAP contract를 하나의 check로 평가하고, build 또는 test가 실패하면 양쪽 output tail을 보존한다.

## Detailed evidence

수정 전 순서:

```text
clean → focused node --test → ERR_MODULE_NOT_FOUND
```

수정 후 순서:

```text
clean → workspace build → focused node --test → 11/11, skipped 0
```

## Recurrence-prevention gate

STEP010R1 acceptance는 자신의 source에서 workspace build 호출이 focused `node --test` 호출보다 앞서는지 검사한다. fresh-ZIP acceptance도 generated `dist`가 없는 상태에서 같은 gate를 다시 실행한다.
