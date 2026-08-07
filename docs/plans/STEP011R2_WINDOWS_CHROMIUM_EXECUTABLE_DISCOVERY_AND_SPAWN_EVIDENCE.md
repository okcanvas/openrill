# STEP011R2 — WINDOWS CHROMIUM EXECUTABLE DISCOVERY AND SPAWN EVIDENCE

## 목적

STEP011R1의 실제 Windows `142/143` 실패를 코드와 로그로 확정하고, Linux 전용 Chromium 경로를 제거해 Windows에 설치된 Chromium-family browser를 결정적으로 찾으며 process creation 실패 증거를 보존한다.

## 기준선

```text
Input candidate:
  STEP011R1_WINDOWS_SQLITE_WAL_CLEANUP_AND_FAILURE_PRESERVATION
  version=0.11.1-step011r1
  Windows=142/143 FAILED
  nested STEP011=194/195 FAILED
  only failure=Chromium exited -4058 before DevToolsActivePort

Output candidate:
  STEP011R2_WINDOWS_CHROMIUM_EXECUTABLE_DISCOVERY_AND_SPAWN_EVIDENCE
  version=0.11.2-step011r2
  schema=7
  framework=VUE_3
```

공식 Windows-live accepted baseline은 STEP010AR1 `121/121`을 유지한다. STEP011R2가 exact Vue와 actual Chromium full regression을 통과하기 전에는 STEP011을 baseline으로 승격하지 않는다.

## Windows 실패 증거

```text
[PASS] focused-cleanup-tests
[FAIL] step011-full-regression
[FAIL] step011-real-chromium-live
Error: Chromium exited -4058:
    at launchBrowser (.../run-step011-live.mjs:194:42)
STEP011_CONTROL_UI_VERTICAL_SLICE checks=194/195 state=FAILED
STEP011R1_... checks=142/143 state=FAILED
```

## 코드 확인

- `spawn("/usr/bin/chromium", ...)`이 platform 조건 없이 사용됐다.
- Windows Chrome/Edge/Chromium 설치 위치와 PATH를 검사하지 않았다.
- browser child의 `error` event를 관찰하지 않아 executable path와 OS code가 사라졌다.
- polling loop는 numeric `exitCode`와 빈 stdout/stderr만 보고했다.

## 구현 범위

- cross-platform Chromium-family executable resolver
- explicit `OPENRILL_CHROMIUM_EXECUTABLE` override
- deterministic PATH and standard-location candidates
- target-platform `path.win32`/`path.posix` semantics
- Chrome, Edge, Chromium 지원
- child spawn `error` event capture
- stable missing-browser and launch-failure diagnostics
- focused resolver/spawn tests
- 기존 cleanup, exact Vue, actual CDP vertical slice 유지

## 공개 계약

Control UI, Protocol, SQLite schema, Vue version과 browser operation flow는 변경하지 않는다.

Release identity:

```text
STEP011R2_WINDOWS_CHROMIUM_EXECUTABLE_DISCOVERY_AND_SPAWN_EVIDENCE
version=0.11.2-step011r2
```

Optional acceptance environment:

```text
OPENRILL_CHROMIUM_EXECUTABLE=<absolute browser executable path>
```

## 상태 전이

```text
STEP011R1 Windows exact Vue acquired
→ focused cleanup PASSED
→ Chromium launch attempts POSIX literal
→ Windows process creation exits -4058
→ STEP011R2 cross-platform resolution
→ actual Chromium CDP vertical slice rerun pending
```

## 실패 및 복구

- override가 설정되면 첫 후보로만 사용하고 존재 여부를 검증한다.
- 발견 가능한 browser가 없으면 `OPENRILL_CHROMIUM_EXECUTABLE_NOT_FOUND`로 fail closed한다.
- spawn error가 발생하면 OS code와 attempted executable을 보존한다.
- browser를 찾지 못했다고 mock browser나 static DOM test로 대체하지 않는다.
- Edge를 선택해도 CDP와 Vue runtime actual page contract는 동일하게 실행한다.

## Acceptance

- root/workspace release identity 정렬
- resolver/static live contract
- focused browser resolver/spawn tests `7/7`
- canonical suite `138/138`, 24 files, skipped 0, concurrency 1
- STEP011 full regression `195/195`, browser=CHROMIUM
- exact Vue 3.5.40 supply/hash/license/re-extraction
- STEP010 Skill live regression
- Issue Registry `OR-ISSUE-001..043`
- detailed evidence와 recurrence gates
- deterministic package manifest와 ZIP
- generated/runtime/protected/credential payload zero

## 반복 방지 기록

```text
OR-ISSUE-042 Windows Chromium POSIX executable hardcode
OR-ISSUE-043 Chromium spawn error evidence loss
```

각 이슈는 Registry row, 상세 실패 문서, 자동 recurrence gate를 갖는다.

## 패키징 산출물

```text
openrill-step011r2-windows-chromium-executable-discovery-spawn-evidence-v1.zip
openrill-step011r2-windows-chromium-executable-discovery-spawn-evidence-v1.zip.sha256.txt
reference/validation/STEP011R2_ACCEPTANCE_REPORT.txt
```

## 제외

- Vue 버전 변경
- browser flow 축소 또는 mock 대체
- browser 자동 설치
- registry 수정
- Windows 한 경로만 추가하는 임시 patch
- 원문에 없는 Control UI 기능 실패 원인 추측

## 완료 선언

Windows에서 exact Vue 3.5.40과 실제 Chrome/Edge/Chromium을 사용한 STEP011 full regression 및 STEP011R2 acceptance가 모두 PASS해야 STEP011R2를 Windows-live accepted baseline으로 선언한다.
