# STEP003A — DETERMINISTIC_NODE_TEST_REPORTER

## 목적

Windows Node 24.18.0의 실제 `pnpm acceptance:step003`에서 드러난 test reporter 판정 결함을 수정한다. Unit test 29개는 모두 성공했고 suite process도 성공했지만, Node의 자동 선택 reporter가 `ℹ tests 29`를 출력한 반면 STEP003 acceptance는 `# tests 29`만 허용했다. OpenRill은 test reporter를 명시하고 수용 판정을 플랫폼 독립적인 TAP summary와 자체 suite marker에 결합한다.

## 기준선

- Input: `STEP003_CONFIG_SNAPSHOT_AND_SECRET_REFERENCES`, version `0.3.0-step003`
- Output: `STEP003A_DETERMINISTIC_NODE_TEST_REPORTER`, version `0.4.0-step004`
- Previous Windows-live baseline: `STEP002B_CROSS_PLATFORM_PROFILE_PATH_SEMANTICS`
- STEP003 Windows result: config/Host live PASS, 29/29 unit tests PASS, acceptance reporter assertion 1건 FAIL

## Reference Evidence

### 실제 Windows 출력

```text
ℹ tests 29
ℹ pass 29
ℹ fail 0
```

STEP003 runner가 기대한 표현은 다음이었다.

```text
# tests 29
```

동일 실행에서 `OPENRILL_STEP001_SUITE_PASS`가 출력되고 process exit code도 0이었다.

### 저장소 코드 증거

- `scripts/run-step001-suite.mjs`: `node --test`를 reporter 지정 없이 실행했다.
- `scripts/run_step003_acceptance.py`: `# tests 29` 문자열을 필수 조건으로 사용했다.
- Windows에서는 Node 24가 다른 default reporter를 선택했다.

## 원인

테스트 성공 여부와 개수를 검증하려는 acceptance가 Node의 자동 reporter 선택과 장식 문자에 결합됐다. Default reporter는 공개 제품 계약이 아니며 platform/runtime 출력 환경에 따라 달라질 수 있다.

추가로 suite runner는 Windows에서 `shell: true`를 사용해 Node `DEP0190` 경고를 발생시켰다. 명령과 인자를 배열로 이미 분리하고 있으므로 shell command concatenation은 필요하지 않다.

## 구현 범위

1. `scripts/run-step001-suite.mjs`
   - unit test command에 `--test-reporter=tap`을 명시한다.
   - `shell: false`를 고정한다.
   - spawn error를 별도 fail-closed marker로 처리한다.
   - color와 Python child encoding을 명시한다.
   - 성공 marker에 `reporter=TAP`을 포함한다.
2. `scripts/run_step003_acceptance.py`
   - 명시적 TAP suite marker를 요구한다.
   - TAP의 `# tests 29`, `# pass 29`, `# fail 0`을 검증한다.
3. STEP003A acceptance
   - source contract와 실제 suite output을 함께 검증한다.
   - STEP003 전체 141/141 회귀를 실행한다.

## 공개 계약

```text
Node test reporter       TAP, explicit
shell execution          false
suite success marker     OPENRILL_STEP001_SUITE_PASS ... reporter=TAP
unit total               # tests 29
pass total               # pass 29
failure total            # fail 0
platform default glyph   not a contract
```

- acceptance는 `ℹ`, color, TTY 감지 결과에 의존하지 않는다.
- 모든 command와 args는 shell concatenation 없이 직접 전달한다.
- spawn 자체가 실패하면 command status와 별개로 fail closed한다.

## 상태 전이

```text
STEP003_DETERMINISTIC_PASS
  → WINDOWS_DEFAULT_REPORTER_DIFFERED
  → FALSE_NEGATIVE_140_OF_141
  → EXPLICIT_TAP_REPORTER
  → SHELL_FALSE
  → STEP003_REGRESSION_141_OF_141
  → STEP003A_ACCEPTED
```

제품 config 상태나 Host lifecycle 상태 전이에는 변경이 없다.

## 실패 및 복구

- TAP reporter가 선택되지 않으면 실패한다.
- suite marker에 `reporter=TAP`이 없으면 실패한다.
- tests/pass/fail summary가 29/29/0이 아니면 실패한다.
- shell execution이 다시 활성화되면 실패한다.
- STEP003 전체 회귀가 141/141이 아니면 STEP003A를 수용하지 않는다.

## Acceptance

- 25개 package version alignment
- explicit `--test-reporter=tap`
- `shell: false`와 platform shell branch 0
- spawn error fail-closed
- deterministic suite marker
- actual TAP totals 29/29/0
- STEP003 full regression 141/141
- runtime/database/protected payload zero
- Windows CRLF launcher

Windows 명령:

```cmd
pnpm install --frozen-lockfile
pnpm acceptance:step003a
```

## 패키징 산출물

- version `0.4.0-step004`
- `scripts/run_step003a_acceptance.py`
- `scripts/sh_run_step003a_acceptance.cmd`
- `scripts/sh_run_step003a_acceptance.sh`
- `scripts/package_step003a.py`
- `reference/validation/STEP003_WINDOWS_DEFAULT_REPORTER_FAILURE.md`
- `reference/validation/STEP003A_ACCEPTANCE_REPORT.txt`
- deterministic ZIP and SHA-256

## 제외

- config kernel behavior 변경
- Host lifecycle 변경
- unit test 내용 또는 개수 변경
- Node/pnpm/TypeScript version 변경
- public WebSocket/RPC
- SQLite
- Agent/Tool 실행
- UI framework 선택
