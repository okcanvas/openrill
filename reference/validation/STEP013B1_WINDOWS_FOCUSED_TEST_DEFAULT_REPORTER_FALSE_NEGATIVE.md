# OR-ISSUE-096 — STEP013B1 Windows focused test default reporter false negative

## 실제 증상

Windows에서 `pnpm acceptance:step013b1` 실행 결과는 다음 marker로 종료됐다.

```text
STEP013B1_PLAYWRIGHT_ADAPTER_AND_READ_ONLY_BROWSER_OBSERVATION checks=78/82 state=FAILED schema=9 baseline=STEP013AR4 adapter=PLAYWRIGHT_CORE tools=READ_ONLY_6 refs=DOCUMENT_GENERATION_SCOPED stale_ref=BROWSER_STALE_REF process_count=0 chromium_orphan=0
```

실패로 출력된 check는 정확히 네 개였다.

```text
focused-browser-observation
focused-browser-adapter-boundaries
focused-browser-runtime
focused-browser-boundaries
```

각 child process는 exit code 0이었고 실제 subtest도 각각 5/5, 5/5, 13/13, 8/8로 모두 통과했다. 그러나 Windows Node 기본 reporter는 다음 형식이었다.

```text
✔ ...
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

## 코드로 확정한 원인

`scripts/run_step013b1_acceptance.py`의 `tap_pass()`는 TAP summary만 해석한다.

```text
# tests N
# pass N
# fail 0
# cancelled 0
# skipped 0
```

하지만 네 focused stage command에는 `--test-reporter=tap`이 없었다. Node의 기본 reporter는 runtime/platform/output context에 따라 달라지므로 Windows에서는 `spec` 형식이 선택됐다. 따라서 제품 테스트는 성공했지만 acceptance predicate만 false가 됐다.

이 결함은 이미 OR-ISSUE-007과 ADR-0018에서 금지한 동일 결함군의 재발이다. STEP013B1 신규 runner가 기존 reporter 헌법을 적용하지 않은 것이 정확한 원인이다.

## 영향

- Browser observation/runtime/adapter 구현 실패가 아니다.
- acceptance가 실제 성공한 31개 focused test를 네 개의 실패 check로 잘못 판정했다.
- runner는 모든 실패 check만 `OPENRILL_STEP013B1_FAILURE`로 출력한다. 제공된 failure list에 `browser-live`가 없으므로 같은 Windows 실행에서 concrete Playwright Chromium vertical slice와 `process_count=0 chromium_orphan=0` gate는 통과했다.
- 전체 aggregate가 실패했으므로 STEP013B1 자체는 accepted로 승격하지 않는다.

## 수정

- predecessor `run_step013b1_acceptance.py`의 네 focused command에 `--test-reporter=tap`을 명시한다.
- corrective `run_step013b1a_acceptance.py`도 모든 Node focused stage에 TAP를 명시한다.
- TAP parser를 사용하는 command가 reporter 선택을 생략하지 못하도록 static regression test를 추가한다.
- 실제 standalone child test를 실행하여 `# tests/# pass/# fail/# skipped` contract를 검증한다.

## 재발 방지 gate

```text
tests/unit/focused-test-reporter-step013b1a.test.mjs
scripts/run_step013b1a_acceptance.py :: tap-reporter-current:*
scripts/run_step013b1a_acceptance.py :: tap-reporter-predecessor:*
```

## 수정 후 요구 결과

```text
STEP013B1A_WINDOWS_DETERMINISTIC_FOCUSED_TEST_REPORTER_ALIGNMENT
state=PASSED
reporter=TAP
process_count=0
chromium_orphan=0
```
