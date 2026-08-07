# STEP012A Windows Package Manifest Post-Regression Mutation

## 실제 명령과 증상

Windows에서 다음 명령을 실행했다.

```cmd
cd /d D:\NODE_AGENTS\okcanvas-openrill
pnpm acceptance:step012a
```

Automation focused test, canonical suite, actual Chromium STEP011 regression은 모두 성공했다.

```text
[PASS] focused-automation-tests :: automation_tests_pass
[PASS] canonical-suite :: suite_pass
[PASS] step011-full-regression :: step011_pass
```

그 뒤 package manifest 검증만 다음과 같이 실패했다.

```text
[FAIL] package-manifest-verified :: OPENRILL_PACKAGE_MANIFEST_FAIL declared=650 actual=650
STEP012A_AUTOMATION_DOMAIN_AND_PERSISTENCE_FOUNDATION checks=142/143 state=FAILED
```

파일 수가 같으므로 missing/extra 파일 실패가 아니라 manifest에 선언된 기존 파일 중 하나 이상의 size 또는 SHA-256 변경이다. 당시 verifier는 변경 경로를 출력하지 않았다.

## 코드로 확정한 원인

패키지의 `PACKAGE_MANIFEST.json`에는 다음 파일이 포함되어 있었다.

```text
reference/validation/STEP011_ACCEPTANCE_REPORT.txt
sha256=60197997ab8489d3f85f77d6e4f8553ca3a210e955accb2610c0440d30bec6e5
```

이 SHA는 패키징 환경에서 exact Vue/actual Chromium prerequisite를 실행하지 못한 STEP011 local report의 바이트다.

`run_step012a_acceptance.py`는 마지막 manifest 검증 전에 다음 nested runner를 실행했다.

```python
regression_ok, regression_output = run_utf8([
    "python", "scripts/run_step011_acceptance.py"
])
```

`run_step011_acceptance.py`는 고정 경로를 직접 소유하고 종료 시 항상 덮어썼다.

```python
REPORT = ROOT / "reference/validation/STEP011_ACCEPTANCE_REPORT.txt"
REPORT.write_text(...)
```

Windows에서는 actual Chromium regression이 성공했으므로 nested STEP011 report가 packaged local report와 다른 `228/228 PASSED` 내용으로 바뀌었다. 그 직후 manifest verifier가 같은 source tree를 검사해 다음 상태가 되었다.

```text
declared file count = 650
actual file count   = 650
STEP011 report hash = changed
```

따라서 product Automation domain, schema 8, schedule 계산, SQLite concurrency가 실패한 것이 아니다. Acceptance runner가 자신이 검증할 immutable package member를 실행 중 변경한 validation defect다.

현재 STEP012A report도 `reference/validation/STEP012A_ACCEPTANCE_REPORT.txt`에 직접 기록하므로 첫 실행 종료 후 source tree가 manifest와 달라지고, 같은 tree에서 두 번째 실행하면 동일 계열 실패가 재현될 수 있었다.

## 영향

- 모든 제품 회귀가 통과한 Windows 실행이 마지막 manifest gate에서 허위 실패한다.
- `declared=actual`만 출력해 변경 파일을 즉시 식별할 수 없다.
- acceptance를 한 번 실행한 source tree가 package manifest와 달라져 반복 실행 가능성이 깨진다.
- local prerequisite-failed report와 Windows browser-passed report의 환경 차이가 immutable source 파일 mutation으로 전파된다.

## 수정

`STEP012AR1_ACCEPTANCE_REPORT_IMMUTABILITY_AND_MANIFEST_DIAGNOSTICS`는 다음 계약을 도입한다.

1. `OPENRILL_ACCEPTANCE_REPORT_PATH` override를 공통 helper가 해석한다.
2. Nested STEP011은 `.artifacts/nested/STEP011_ACCEPTANCE_REPORT.txt`에 기록한다.
3. Current STEP012AR1은 기본적으로 `.artifacts/acceptance/STEP012AR1_ACCEPTANCE_REPORT.txt`에 기록한다.
4. `.artifacts`는 manifest와 ZIP에서 제외되는 실행 산출물 경계다.
5. Packaged `reference/validation/*_ACCEPTANCE_REPORT.txt`는 실행 중 변경하지 않는다.
6. STEP012AR1은 nested 실행 전후 packaged STEP011 report SHA-256 동일성을 검사한다.
7. Package manifest는 build/regression 전과 후에 모두 검증한다.
8. Verifier는 missing, extra, changed 수와 bounded repository-relative path를 출력한다.

Candidate report를 package에 넣을 때만 명시적 override로 canonical reference path를 사용하고, 그 뒤 manifest를 다시 생성한다. 일반 Windows acceptance 실행은 immutable package members를 변경하지 않는다.

## 수정 전 재현

수정 전 구조의 최소 재현은 다음과 같다.

```text
1. manifest에 STEP011_ACCEPTANCE_REPORT.txt의 local hash 기록
2. nested STEP011 actual Chromium PASS 실행
3. runner가 같은 report path를 228/228 내용으로 overwrite
4. verifier 실행
5. declared=650 actual=650, hash mismatch로 FAIL
```

새 verifier focused fixture는 동일한 파일 수를 유지한 채 `a.txt` 내용만 바꾸고 다음 진단을 요구한다.

```text
OPENRILL_PACKAGE_MANIFEST_FAIL declared=1 actual=1 missing=0 extra=0 changed=1 changed_paths=a.txt
```

## 자동 recurrence-prevention gate

- `tests/unit/acceptance-report-immutability-step012ar1.test.mjs`
  - verifier가 changed path를 출력한다.
  - report helper의 default/override path를 실행 검증한다.
  - nested STEP011 runner가 override helper를 사용한다.
  - current runner가 nested/current report를 `.artifacts`에 격리한다.
- STEP012AR1 acceptance
  - `package-manifest-initial`
  - `nested-step011-report-artifact`
  - `nested-step011-packaged-report-immutable`
  - `package-manifest-final`
- Issue Registry `OR-ISSUE-058`
- `RECURRENCE_PREVENTION_GATES.md`의 Acceptance report immutability 계약

## 종료 조건

Windows에서 다음을 모두 만족해야 한다.

```text
STEP011_CONTROL_UI_VERTICAL_SLICE ... state=PASSED schema=8 browser=CHROMIUM
nested-step011-packaged-report-immutable=PASS
package-manifest-final=PASS
STEP012AR1 ... state=PASSED
```
