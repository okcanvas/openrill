# STEP013B1A_WINDOWS_DETERMINISTIC_FOCUSED_TEST_REPORTER_ALIGNMENT

## 목적

STEP013B1 Windows에서 실제 Browser focused tests와 live Chromium vertical slice가 성공했음에도 네 focused command가 platform-default Node reporter를 사용해 aggregate가 78/82 false negative로 종료된 결함을 수정한다.

## Identity

```text
step=STEP013B1A_WINDOWS_DETERMINISTIC_FOCUSED_TEST_REPORTER_ALIGNMENT
version=0.13.6-step013b1a
schema=9
baseline=STEP013AR4_ACCEPTANCE_STAGE_RUNNER_FIXTURE_IMPORT_ALIGNMENT
retained_feature=STEP013B1_PLAYWRIGHT_ADAPTER_AND_READ_ONLY_BROWSER_OBSERVATION
```

## 코드 확인 결과

- `tap_pass()`는 TAP summary를 요구했다.
- STEP013B1의 네 focused `node --test` command만 `--test-reporter=tap`을 누락했다.
- Windows output은 `✔`와 `ℹ tests` 형식이었다.
- child return code와 31개 subtest는 모두 성공했다.
- failure list에 `browser-live`가 없으므로 live Playwright, stale ref, close, process/orphan gate는 통과했다.

## 구현 범위

- predecessor와 corrective runner의 모든 focused Node test에 explicit TAP reporter
- reporter ownership static gate
- standalone TAP summary fixture
- nested Node test context sanitization
- OR-ISSUE-096, OR-ISSUE-097 상세 문서·Registry·recurrence gate
- current identity, package manifest, handoff, validation 문서 갱신

## 비변경 범위

Browser runtime, Playwright adapter, Tool schemas, ref generation, navigation policy, protocol, state schema, migrations, Browser ledger는 STEP013B1과 동일하다.

## Acceptance

```text
source/version/lock/module-link gates
package manifest initial
workspace build
focused reporter 4/4
focused Browser observation 5/5 TAP
focused adapter boundary 5/5 TAP
focused BrowserRuntime 13/13 TAP
focused Browser boundary 8/8 TAP
canonical serial suite skipped=0
real Playwright local fixture
process_count=0
chromium_orphan=0
package manifest final
```

## 완료 조건

Windows에서 `pnpm install --frozen-lockfile` 후 `pnpm acceptance:step013b1a`의 전체 marker가 PASSED여야 한다. 그 전에는 official accepted baseline은 STEP013AR4로 유지한다.
