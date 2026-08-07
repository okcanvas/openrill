# STEP010AR1 Windows Unit Suite Determinism and Failure Evidence

## 목적

실제 Windows STEP010A `251/252 FAILED`를 추측으로 수정하지 않고, 누락된 TAP 실패 증거를 위치와 무관하게 보존하고 unit file 실행 스케줄을 저장소 계약으로 고정한다.

## 기준선

```text
source=STEP010A_CONTROL_UI_FRAMEWORK_SELECTION
version=0.10.2-step010a
Windows=251/252 FAILED
schema=7
framework=VUE_3
```

이전 Windows-live accepted 기준선은 `STEP010R1` `116/116`이다.

## Windows 실패 증거

```text
build-unit-architecture-exports=FAIL
# tests 117
# pass 116
# fail 1
# skipped 0
```

수집된 detail은 test 70 중간부터 시작하여 실패한 test 1~69의 assertion을 포함하지 않는다. 따라서 원래 실패한 제품 코드 위치는 주장하지 않는다.

## 코드 확인

- `run_step010a_acceptance.py`가 `suite_output[-10000:]`만 보존했다.
- `run-step001-suite.mjs`가 `--test-concurrency`를 선언하지 않았다.
- suite에는 Host, socket, process, signal, SQLite contention과 bounded timeout fixture가 함께 있다.

## 구현 범위

- TAP 첫 실패 block과 summary의 위치 독립 추출
- synthetic early-failure extractor gate
- aggregate unit file concurrency `1` 고정
- success marker에 concurrency 포함
- STEP010A 전체 기능 regression
- Issue Registry, 상세 증거, recurrence gate
- deterministic ZIP과 fresh-ZIP acceptance

## 공개 계약

```text
OPENRILL_STEP001_SUITE_PASS unit_files=20 reporter=TAP concurrency=1
OPENRILL_TAP_FAILURE_BEGIN
OPENRILL_TAP_FAILURE_END
```

제품 Runtime, Local Protocol, schema, Skill snapshot, UI framework decision 계약은 변경하지 않는다.

## 상태 전이

```text
STEP010A Windows 251/252 FAILED
→ evidence loss confirmed
→ test-file schedule declared
→ STEP010A feature regression
→ STEP010AR1 deterministic acceptance
→ Windows live rerun pending
```

## 실패 및 복구

- 실제 failed subtest가 다시 발생하면 acceptance report에 해당 TAP block을 보존한다.
- serial schedule에서도 실패하면 그 block을 근거로 새 이슈를 열며 추측하지 않는다.
- suite exit 0이어도 marker/count 불일치는 failure이다.

## Acceptance

- full unit/build/architecture/export `117/117`, skipped 0
- `concurrency=1` marker
- synthetic early TAP failure extraction
- STEP010A spike and Skill live regression
- issue documents and recurrence gates
- manifest, deterministic ZIP, fresh extraction
- generated/runtime/protected/credential payload 0

## 반복 방지 기록

```text
OR-ISSUE-035 position-dependent TAP failure evidence loss
OR-ISSUE-036 undeclared unit-file concurrency
```

각 항목은 Issue Registry, 상세 증거 문서, 자동 gate를 갖는다.

## 패키징 산출물

```text
openrill-step010ar1-windows-unit-suite-determinism-failure-evidence-v1.zip
```

## 제외

- 누락된 Windows failed subtest를 추측하여 제품 코드를 변경하지 않는다.
- Vue production runtime과 browser E2E는 STEP011 범위다.
- schema migration은 없다.

## 완료 선언

source와 fresh ZIP의 STEP010AR1 acceptance가 모두 통과하고 Windows live rerun 명령이 문서화된 경우에만 packaged deterministic baseline으로 선언한다.
