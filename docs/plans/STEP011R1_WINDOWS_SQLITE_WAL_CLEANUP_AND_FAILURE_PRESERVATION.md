# STEP011R1 — WINDOWS SQLITE WAL CLEANUP AND FAILURE PRESERVATION

## 목적

STEP011의 실제 Windows `194/195` 실패를 코드와 로그로 확정하고, real Chromium 수직 흐름 종료 후 SQLite WAL/SHM handle release를 결정적으로 기다리며 cleanup 예외가 앞선 기능 실패 증거를 덮지 않게 한다.

## 기준선

```text
Input candidate:
  STEP011_CONTROL_UI_VERTICAL_SLICE
  version=0.11.0-step011
  Windows=194/195 FAILED
  only failure=agent.db-shm cleanup EBUSY

Output candidate:
  STEP011R1_WINDOWS_SQLITE_WAL_CLEANUP_AND_FAILURE_PRESERVATION
  version=0.11.1-step011r1
  schema=7
  framework=VUE_3
```

공식 Windows-live accepted baseline은 STEP010AR1 `121/121`을 유지한다. STEP011R1이 real Chromium을 포함해 통과하기 전에는 STEP011을 baseline으로 승격하지 않는다.

## Windows 실패 증거

```text
[PASS] vue-runtime-byte-identical
[PASS] vue-license-byte-identical
[PASS] build-unit-architecture-exports :: suite_pass
[FAIL] step011-real-chromium-live :: EBUSY unlink ...\agent.db-shm
[PASS] step010-skill-live-regression :: live_pass
STEP011_CONTROL_UI_VERTICAL_SLICE checks=194/195 state=FAILED
```

Exact Vue acquisition과 모든 derived supply gate, unit/build/architecture/export, STEP010 Skill regression은 통과했다.

## 코드 확인

- `DatabaseSync.close()` 뒤 temp root를 즉시 one-shot `rm()`했다.
- `browser.kill()` 뒤 child exit event를 기다리지 않았다.
- `finally` cleanup 예외가 본문 예외보다 우선해 원래 assertion을 덮을 수 있었다.
- retry code/attempt/delay의 bounded contract가 없었다.

## 구현 범위

- `scripts/live-fixture-cleanup.mjs` 공통 helper
- Chromium/Host 실제 exit wait와 timeout hard termination
- provider close callback completion wait
- Windows transient cleanup code만 bounded retry
- primary failure와 cleanup failure 분리
- injected EBUSY/non-transient/child/server unit fixture
- STEP011 full exact Vue/Chromium regression 유지

## 공개 계약

Control UI, Protocol, SQLite schema, Vue version, browser flow는 변경하지 않는다.

Release identity만 다음으로 증가한다.

```text
STEP011R1_WINDOWS_SQLITE_WAL_CLEANUP_AND_FAILURE_PRESERVATION
version=0.11.1-step011r1
```

## 상태 전이

```text
STEP011 Windows exact Vue acquired
→ canonical suite PASSED
→ real Chromium functional path completed
→ temp-root agent.db-shm one-shot unlink EBUSY
→ STEP011R1 bounded cleanup and evidence preservation
→ Windows real Chromium rerun pending
```

## 실패 및 복구

- transient cleanup lock은 최대 40회, 100ms 선형 delay로만 retry한다.
- non-transient error는 즉시 실패한다.
- child exit가 5초 내 완료되지 않으면 hard termination 후 다시 bounded wait한다.
- 본문 실패가 있으면 cleanup failure는 원래 error를 대체하지 않는다.
- 본문 성공 후 cleanup이 끝내 실패하면 STEP011R1도 실패한다.

## Acceptance

- root/workspace release identity 정렬
- helper와 live runner static contract
- focused cleanup tests `4/4`
- canonical suite `131/131`, 23 files, skipped 0, concurrency 1
- STEP011 full regression `195/195`, browser=CHROMIUM
- exact Vue 3.5.40 supply/hash/license/re-extraction
- STEP010 Skill live regression
- Issue Registry `OR-ISSUE-001..040`
- detailed evidence와 recurrence gates
- deterministic package manifest와 ZIP
- generated/runtime/protected/credential payload zero

## 반복 방지 기록

```text
OR-ISSUE-039 Windows SQLite SHM cleanup EBUSY
OR-ISSUE-040 cleanup exception masks primary failure
OR-ISSUE-041 feature/release identity assertion drift
```

각 이슈는 Registry row, 상세 실패 문서, 자동 recurrence gate를 갖는다.

## 패키징 산출물

```text
openrill-step011r1-windows-sqlite-wal-cleanup-failure-preservation-v1.zip
openrill-step011r1-windows-sqlite-wal-cleanup-failure-preservation-v1.zip.sha256.txt
reference/validation/STEP011R1_ACCEPTANCE_REPORT.txt
```

## 제외

- Vue 버전 변경
- browser flow 축소 또는 mock 대체
- SQLite journal mode 변경
- 무제한 retry
- cleanup failure 무시
- 원문에 없는 STEP011 기능 실패 원인 추측

## 완료 선언

Windows에서 exact Vue 3.5.40과 actual Chromium을 사용한 STEP011 full regression 및 STEP011R1 acceptance가 모두 PASS해야 STEP011R1을 Windows-live accepted baseline으로 선언한다.
