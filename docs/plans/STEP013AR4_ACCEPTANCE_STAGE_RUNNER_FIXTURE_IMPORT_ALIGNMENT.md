# STEP013AR4_ACCEPTANCE_STAGE_RUNNER_FIXTURE_IMPORT_ALIGNMENT

## 목적

STEP013AR3 Windows에서 stage-runner timeout fixture가 repository root의 암묵적 Python import path에 의존해 실패한 결함을 제거한다.

## 기준선

- retained feature: `STEP013A_BROWSER_RUNTIME_LIFECYCLE_AND_POLICY_FOUNDATION`
- corrective predecessor: `STEP013AR3_ACCEPTANCE_STAGE_PROGRESS_AND_TIMEOUT_ALIGNMENT`
- official accepted baseline: `STEP012DR4_AUTOMATION_HISTORY_ROW_SELECTOR_ISOLATION`, Windows `180/180`
- schema: 9 유지

## 코드 확인

실제 aggregate stage runner는 START/END/HEARTBEAT를 출력했다. 실패한 것은 Node test가 `python -c`에서 `from scripts.acceptance_stage_runner import run_stage`를 실행하며 current root의 `sys.path` 자동 포함을 가정한 fixture bootstrap이다.

## 구현 범위

- helper absolute file identity resolution
- `importlib.util.spec_from_file_location` loading
- `sys.modules` registration before module execution
- unrelated temporary cwd fixture
- Python safe-path isolated execution
- retained timeout/process-tree evidence assertions
- OR-ISSUE-089 documentation and gates

## 공개 계약

Stage runner public markers and timeout behavior do not change. The fixture import contract becomes cwd/PYTHONPATH independent.

## 상태 전이

```text
FIXTURE_BOOTSTRAP -> EXPLICIT_HELPER_LOAD -> CHILD_START -> TIMEOUT -> TREE_TERMINATED -> EVIDENCE_ASSERTED
```

## 실패 및 복구

The fixture fails with bounded stdout/stderr when the helper file cannot be loaded or the timeout child is not terminated. It no longer falls back to namespace or cwd imports.

## Acceptance

- retained stage runner focused 4/4
- import-boundary focused 2/2
- workspace lock/module-layout tests
- BrowserRuntime and boundary tests
- historical Host fixtures
- full serial canonical suite with skipped 0
- package manifest pre/post unchanged
- source/fresh report and ZIP determinism

## 반복 방지 기록

`OR-ISSUE-089` detail, Issue Registry, Recurrence Prevention Gates, audit, focused tests, and aggregate checks are updated together.

## 패키징 산출물

- deterministic source ZIP
- SHA-256 sidecar
- immutable acceptance report
- fresh extraction/repack evidence

## 제외

BrowserRuntime behavior, Browser Tool surface, Playwright adapter, protocol, schema, Automation, and accepted STEP012DR4 source are unchanged.

## 완료 선언

Windows에서 STEP013AR4 final marker가 확인되기 전에는 accepted로 승격하지 않는다.
