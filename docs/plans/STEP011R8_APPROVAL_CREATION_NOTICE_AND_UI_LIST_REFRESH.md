# STEP011R8 Approval creation notice and UI list refresh

## 목적

실제 Windows STEP011R7 Chromium 결과의 `CONNECTED`, `alert=null`, `ApprovalsNo approvals.` 상태를 코드 경로로 확정하고, 승인 요청 생성 직후 Control UI가 pending approval 목록을 다시 읽도록 승인 도메인 알림 경계를 완성한다.

## 기준선

```text
source=STEP011R7_PROCESS_MANAGER_ASYNC_CLOSE_AND_WINDOWS_CHILD_QUIESCENCE
version=0.11.7-step011r7
Windows=step011-full-regression FAILED
schema=7
framework=VUE_3
```

공식 accepted baseline은 계속 STEP010AR1 `121/121 ACCEPTED`다.

## Windows 실패 증거

실제 Chromium page evidence:

```text
url=<LOOPBACK>/#/approvals
vueVersion=3.5.40
appShell=true
connection=CONNECTED
alert=null
appText=...ApprovalsNo approvals.
diagnostics=[]
```

R7은 Vue mount, strict CSP, WebSocket 연결, Proxy-safe projection까지 성공했지만 pending approval action이 렌더링되지 않았다.

## 코드 확인

- bootstrap 직후 `approval.list`를 한 번 호출하며 이 시점에는 승인 요청이 아직 없다.
- `ApprovalService.authorizeOrRequest()`는 PENDING row를 먼저 저장한 뒤 Kernel에 approval-required 결과를 전달한다.
- Kernel은 `approval.requested` progress event를 발생시킨다.
- R7 `AgentRunCoordinator`는 모든 progress를 `run.event`로만 publish했다.
- Control UI는 `approval.updated` notice에서만 `loadApprovals()`를 호출한다.
- 따라서 DB에 요청이 생성돼도 creation 단계에는 승인 목록 재조회 trigger가 없었다.
- R7 실패 runner는 이 대기 실패 시 approval ledger를 출력하지 않아 row 존재 여부를 Windows 로그에서 직접 확인할 수 없었다. R8은 동일 실패 시 DB 승인 행, Run 상태, provider request 수를 함께 기록한다.

## 구현 범위

- `approval.requested` progress의 기존 `run.event` 유지
- 유효한 approval creation payload에 `approval.updated` 추가 발행
- 일반 progress와 malformed payload의 승인 notice 발행 금지
- 기존 UI `approval.updated → approval.list` 계약 유지
- 승인 렌더 대기 실패 시 bounded ledger evidence 추가
- OR-ISSUE-054, 상세 증거, recurrence gate
- current release 문서, manifest, deterministic ZIP 정렬

## 공개 계약

```text
approval request durable insert
→ run.event(type=approval.requested)
→ approval.updated(requestId, runId, status=PENDING, ...)
→ Control UI approval.list
→ pending approval action rendered
```

`run.event`는 conversation progress projection을 위해 유지한다. 승인 목록은 generic progress event를 해석하지 않고 명시적 `approval.updated` 도메인 notice만 사용한다.

## 상태 전이

```text
process.run requires approval
→ approval_requests.status=PENDING
→ approval.requested progress
→ run.event published
→ approval.updated published
→ browser receives domain notice
→ approval.list reload
→ allow_once/allow_for_conversation/deny action visible
```

## 실패 및 복구

- malformed approval progress는 `run.event`만 유지하고 잘못된 `approval.updated`를 발행하지 않는다.
- UI의 `approval.list` 호출 실패는 visible alert로 남는다.
- pending approval render timeout은 browser evidence와 approval ledger evidence를 함께 보존한다.
- notice gap은 기존 snapshot/resync 계약을 사용한다.
- 승인 TTL, process timeout, Proxy-safe projection, async child quiescence 계약은 변경하지 않는다.

## Acceptance

- focused approval notice tests 3/3
- canonical serial suite 162/162
- unit files 30, skipped zero, concurrency 1
- architecture/export pass
- nested STEP011 actual Chromium regression
- pending approval render와 allow_once 후 process/artifact/final response 검증
- source/fresh report byte identity
- manifest/ZIP deterministic identity

## 반복 방지 기록

```text
OR-ISSUE-054 Approval creation notice missing from UI refresh path
```

상세 실패 문서와 두 recurrence gate를 함께 유지한다.

### 현재 컨테이너 경계

```text
Focused approval notice = 3/3 PASSED
Canonical suite         = 162/162 PASSED
Architecture            = PASSED
Package exports         = PASSED
Actual Chromium         = Windows rerun pending
STEP011 local           = 216/228 runtime_unavailable
STEP011R8 local         = 197/198 runtime_unavailable
```

현재 컨테이너는 exact Vue 3.5.40 vendor acquisition을 완료할 수 없어 actual Chromium full regression을 통과로 선언하지 않는다.

## 패키징 산출물

```text
openrill-step011r8-approval-creation-notice-ui-list-refresh-v1.zip
manifest=631/631
zip_files=632
STEP011_report_sha256=6be964078671544ebd6c322913cab9dbd6a4e5a3441c73a24dd6aa4fe84a2fdd
STEP011R8_report_sha256=ac96f22e63c0fe1816547805964dad9137740d0cd12344c33ae0c423e37d0795
```

## 제외

- UI가 `run.event` payload를 해석해 approval list를 직접 수정하는 우회
- polling interval 추가
- approval schema 또는 decision 정책 변경
- STEP012 scheduler 구현

## 완료 선언

source와 fresh ZIP deterministic 검증 후 Windows에서 nested STEP011과 STEP011R8 marker가 모두 PASSED일 때만 STEP011 promotion 후보로 본다.
