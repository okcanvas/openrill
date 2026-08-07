# STEP012AR1 Acceptance Report Immutability and Manifest Diagnostics

## 목적

STEP012A Windows 실행에서 제품 회귀가 모두 통과한 뒤 package manifest만 실패한 validation defect를 제거한다. Acceptance 실행 산출물과 immutable packaged evidence를 분리하고, manifest mismatch가 발생하면 변경 경로를 즉시 확인할 수 있게 한다.

## 기준선

```text
feature=STEP012A_AUTOMATION_DOMAIN_AND_PERSISTENCE_FOUNDATION
failed_candidate_version=0.12.0-step012a
current_revision=STEP012AR1_ACCEPTANCE_REPORT_IMMUTABILITY_AND_MANIFEST_DIAGNOSTICS
version=0.12.1-step012ar1
schema=8
official_accepted_baseline=STEP011R8 198/198 WINDOWS_LIVE_ACCEPTED
```

STEP012A의 Automation domain, schema 8, schedule semantics, repository 계약은 변경하지 않는다.

## Windows 실패 증거

```text
[PASS] focused-automation-tests
[PASS] canonical-suite
[PASS] step011-full-regression
[FAIL] package-manifest-verified :: OPENRILL_PACKAGE_MANIFEST_FAIL declared=650 actual=650
STEP012A ... checks=142/143 state=FAILED
```

상세 증거는 `reference/validation/STEP012A_WINDOWS_PACKAGE_MANIFEST_POST_REGRESSION_MUTATION.md`에 보존한다.

## 코드 확인

- `PACKAGE_MANIFEST.json`은 `reference/validation/STEP011_ACCEPTANCE_REPORT.txt`를 포함했다.
- `run_step012a_acceptance.py`는 manifest 검증 전에 `run_step011_acceptance.py`를 실행했다.
- `run_step011_acceptance.py`는 packaged report path를 직접 덮어썼다.
- Windows actual Chromium PASS report는 packaged local `runtime_unavailable` report와 바이트가 다르다.
- current STEP012A runner도 자신의 packaged report를 실행 종료 시 덮어썼다.

## 구현 범위

- `scripts/acceptance_reports.py`
- nested STEP011 report path override
- STEP012AR1 current/nested report `.artifacts` 격리
- pre/post package manifest verification
- packaged STEP011 report pre/post SHA gate
- verifier missing/extra/changed bounded diagnostics
- focused report immutability tests
- OR-ISSUE-058와 recurrence gate

## 공개 계약

일반 acceptance 실행 산출물:

```text
.artifacts/acceptance/STEP012AR1_ACCEPTANCE_REPORT.txt
.artifacts/nested/STEP011_ACCEPTANCE_REPORT.txt
```

Packaged evidence:

```text
reference/validation/STEP011_ACCEPTANCE_REPORT.txt
reference/validation/STEP012AR1_ACCEPTANCE_REPORT.txt
```

일반 실행은 packaged evidence를 수정하지 않는다. Packaging workflow만 명시적 `OPENRILL_ACCEPTANCE_REPORT_PATH` override를 사용해 candidate report를 갱신한 뒤 manifest를 재생성한다.

## 시간 계약

STEP012A의 `at`, anchor-based `interval`, five-field `cron`, IANA timezone, DST gap/repeat 계약은 변경하지 않는다. 이 revision은 acceptance report 경로와 package verification 순서만 수정한다.

## 영속성 계약

Schema 8의 `automation_jobs`, `automation_runs`, optimistic config revision, runtime mutation 분리, `(job_id, scheduled_for)` unique identity는 변경하지 않는다. Acceptance 실행 산출물은 product SQLite와 무관한 `.artifacts` 경계에만 기록한다.

## 상태 전이

```text
PACKAGE_EXTRACTED
→ MANIFEST_PRE_VERIFIED
→ BUILD_AND_FOCUSED_TESTS
→ CANONICAL_SUITE
→ NESTED_STEP011_WITH_ARTIFACT_REPORT
→ PACKAGED_STEP011_HASH_UNCHANGED
→ MANIFEST_POST_VERIFIED
→ CURRENT_REPORT_WRITTEN_TO_ARTIFACTS
→ PASSED/FAILED
```

## 실패 및 복구

- initial manifest 실패: package 자체가 이미 변형되었으므로 즉시 명확한 changed/missing/extra path를 보고한다.
- nested report artifact 미생성: report override 계약 실패다.
- packaged STEP011 hash 변경: nested runner가 immutable boundary를 침범한 것이다.
- final manifest 실패: build/regression 중 package member mutation을 changed path와 함께 보고한다.
- `.artifacts`는 다음 acceptance 시작 시 정리하며 package manifest에는 포함하지 않는다.

## Acceptance

- report-focused 4/4
- Automation focused 14/14
- canonical suite expected 180/180, 32 files, skipped 0
- STEP011 actual Chromium regression
- pre/post manifest PASS
- packaged STEP011 report SHA unchanged
- source/fresh ZIP deterministic packaging

## 반복 방지 기록

```text
OR-ISSUE-058
STEP012A_WINDOWS_PACKAGE_MANIFEST_POST_REGRESSION_MUTATION
```

Issue Registry, 상세 증거, focused test, recurrence gate를 함께 포함한다.

## 패키징 산출물

```text
openrill-step012ar1-acceptance-report-immutability-manifest-diagnostics-v1.zip
openrill-step012ar1-acceptance-report-immutability-manifest-diagnostics-v1.zip.sha256.txt
PACKAGE_MANIFEST.json
STEP012AR1_ACCEPTANCE_REPORT.txt
```

## 제외

- STEP012A Automation domain 변경
- scheduler timer/lease/recovery 구현
- protocol operation
- Conversation Run integration
- Control UI automation page

## 완료 선언

Windows actual Chromium을 포함한 STEP012AR1 marker와 pre/post manifest가 모두 통과하기 전까지 공식 accepted baseline은 STEP011R8이다.
