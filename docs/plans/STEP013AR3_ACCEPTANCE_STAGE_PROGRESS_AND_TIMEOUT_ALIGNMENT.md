# STEP013AR3_ACCEPTANCE_STAGE_PROGRESS_AND_TIMEOUT_ALIGNMENT

## 목적

STEP013AR2 Windows acceptance가 어느 단계인지 표시하지 않은 채 대기하고, 외부 child에 timeout이 없던 acceptance liveness 결함을 수정한다.

## 기준선

- retained feature: `STEP013A_BROWSER_RUNTIME_LIFECYCLE_AND_POLICY_FOUNDATION`
- corrective predecessor: `STEP013AR2_WORKSPACE_MODULE_LINK_LAYOUT_ALIGNMENT`
- official accepted baseline: `STEP012DR4_AUTOMATION_HISTORY_ROW_SELECTOR_ISOLATION`, Windows `180/180`
- schema: 9 유지

## 코드 확인

STEP013AR2는 aggregate 종료 시점에만 report를 출력했고, 모든 외부 stage를 timeout 없는 `subprocess.run`으로 실행했다. 제공된 증거에는 stage marker가 없으므로 실제로 대기한 child는 특정할 수 없다.

## 구현 범위

- 공용 bounded acceptance stage runner
- 즉시 flush되는 start/end marker
- 15초 heartbeat
- stage별 timeout
- Windows process-tree 종료
- POSIX process-group 종료
- timeout/termination evidence
- cleanup 진행 표시와 source-tree scan pruning

## 공개 계약

```text
OPENRILL_ACCEPTANCE_STAGE_START name=<stage> timeout_seconds=<bound>
OPENRILL_ACCEPTANCE_STAGE_HEARTBEAT name=<stage> elapsed_seconds=<n>
OPENRILL_ACCEPTANCE_STAGE_END name=<stage> state=PASS|FAIL|TIMEOUT ...
```

## 상태 전이

```text
PENDING -> RUNNING -> PASS|FAIL|TIMEOUT
```

## 실패 및 복구

Timeout은 해당 child process tree를 종료하고 aggregate check를 실패로 기록한다. Windows에서는 `taskkill /T /F`, POSIX에서는 process group TERM/KILL을 사용한다. 다음 stage로 무조건 진행하지 않고 현재 aggregate 정책에 따라 실패 evidence를 보존한다.

## Acceptance

- stage runner focused 4/4
- retained workspace lock/module-layout tests
- BrowserRuntime and boundary tests
- historical Host fixtures
- full serial canonical suite with skipped 0
- package manifest pre/post unchanged
- source/fresh report and ZIP determinism

## 반복 방지 기록

`OR-ISSUE-088` 상세 문서, Issue Registry, Recurrence Prevention Gates를 함께 갱신한다.

## 패키징 산출물

- deterministic source ZIP
- SHA-256 sidecar
- immutable acceptance report
- fresh extraction/repack evidence

## 제외

BrowserRuntime, Browser Tool, Playwright adapter, protocol, schema, Automation 동작은 변경하지 않는다.

## 완료 선언

Windows에서 bounded stage markers와 최종 PASSED marker가 확인되기 전에는 accepted로 승격하지 않는다.
