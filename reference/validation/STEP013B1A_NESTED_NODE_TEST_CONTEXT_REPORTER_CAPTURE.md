# OR-ISSUE-097 — nested Node test context captured child reporter output

## 실제 증상

STEP013B1A reporter regression fixture가 Node test 내부에서 standalone Node test를 `spawnSync`로 실행했을 때 child exit code는 0이었지만 `stdout`이 비어 `# tests 1` assertion이 실패했다.

진단 fixture 결과:

```text
parent NODE_TEST_CONTEXT=child-v8
inherited child: status=0 stdout_bytes=0 stderr_bytes=181
sanitized child: status=0 stdout_bytes=192 stderr_bytes=0
```

## 코드로 확정한 원인

Node test runner는 test file process에 `NODE_TEST_CONTEXT=child-v8`를 설정한다. 이 값을 nested `node --test` subprocess에 그대로 상속하면 child reporter가 standalone stdout contract가 아니라 parent test-runner child protocol을 사용한다. 따라서 실제 TAP text가 `stdout`에 나타나지 않았다.

## 영향

- product 또는 acceptance runner 결함은 아니다.
- 회귀 fixture가 검사하려는 standalone CLI reporter contract와 다른 execution context를 만들었다.
- 환경 변수를 무시하고 stdout empty를 reporter 실패로 해석하면 다시 false negative가 된다.

## 수정

Nested standalone CLI fixture에서 child environment를 복사한 뒤 `NODE_TEST_CONTEXT`만 제거한다. `NO_COLOR`와 `NODE_DISABLE_COLORS`는 유지한다.

## 재발 방지 gate

`tests/unit/focused-test-reporter-step013b1a.test.mjs`가 실제 temp test file을 실행하고 다음을 모두 요구한다.

```text
child NODE_TEST_CONTEXT absent
exit=0
# tests 1
# pass 1
# fail 0
# skipped 0
```
