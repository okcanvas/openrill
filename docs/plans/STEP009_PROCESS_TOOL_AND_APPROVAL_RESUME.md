# STEP009 — PROCESS_TOOL_AND_APPROVAL_RESUME

## 목적

STEP008의 confined Workspace와 STEP007의 provider-neutral Agent loop 위에 실제 local process 실행 경계를 추가한다. 위험 실행은 durable approval 없이 시작하지 않으며, Host 재시작·중복 resolve·승인 대기 중 Run 중단에도 실행 여부를 SQLite ledger로 판정할 수 있어야 한다.

## 기준선

```text
Input baseline: STEP008_WORKSPACE_AND_FILE_TOOLS
Input version:  0.8.0-step008
Input schema:   5
Windows live:   STEP008 187/187 ACCEPTED
Output step:    STEP009_PROCESS_TOOL_AND_APPROVAL_RESUME
Output version: 0.9.0-step009
Output schema:  6
```

기존 Agent Kernel, OpenAI Responses adapter, Conversation ledger, six Workspace File Tools, point-of-use SecretRef, Host shutdown 순서를 보존한다.

## Reference Evidence

OpenClaw 원본 ZIP을 직접 감사한 결과만 근거로 사용한다.

- `OC-APPROVAL-001` — 실행 보안 레벨이 제한된 타입이다.
- `OC-APPROVAL-002` — 승인 요청 정책이 타입으로 제한된다.
- `OC-APPROVAL-003` — 승인 결정 값이 제한된다.
- `OC-APPROVAL-004` — 승인 대기·해결 수명주기를 전담하는 manager가 있다.
- `OC-APPROVAL-005` — pending request별 expiry timer가 별도로 관리된다.

전체 evidence index는 `119/119 VERIFIED`이며 OpenClaw source/package/protocol을 복사하거나 dependency로 사용하지 않는다.

## OpenClaw 문제 분석

참조 구현의 핵심은 command 실행 자체가 아니라 실행 전 정책 판정, pending approval ownership, expiry, 결정 충돌, continuation이다. OpenRill은 이를 local-first SQLite truth와 기존 Run state machine에 맞게 재설계한다.

단순 in-memory Promise 기반 prompt는 다음을 증명하지 못한다.

- process가 승인 전에 시작되지 않았는가
- 동일 request가 두 번 consume되지 않았는가
- Host restart 후 pending request가 무엇인가
- 승인 당시 input/schema/cwd가 실행 직전에도 같은가
- 거부·취소·만료 결과가 Model context에 정확히 한 번 들어갔는가

따라서 approval은 UI 기능이 아니라 durable execution protocol이다.

## 구현 범위

- `@openrill/approval`: ordered execution policy, request binding, versioned resolve, exactly-once consume, conversation grant, expiry/cancel
- `@openrill/tools-process`: 정확히 네 Tool, argv/shell 분리, foreground/background, bounded output, tail/cancel, orphan recovery
- `@openrill/state`: migration 006과 Tool/Approval/Grant/Process repository
- `@openrill/conversations`: approval wait/resume와 idempotent approval Tool result
- `@openrill/agent-kernel`: `WAITING_APPROVAL` terminal-for-now 결과와 기존 attempt 재개
- `@openrill/protocol`: `approval.list/get/resolve/cancel`
- `@openrill/agent-host`: 정책 구성, approval protocol hooks, process ownership, expiry, Run resume
- 별도 Host 프로세스 + WebSocket UI + local Responses-compatible provider live fixture

## 공개 계약

Process Tool은 정확히 네 개다.

```text
process.run
process.list
process.tail
process.cancel
```

Command는 다음 두 형태를 혼합하지 않는다.

```text
argv:  executable + args[]; shell=false direct spawn
shell: explicit platform shell + script
```

Execution policy 결과:

```text
DENY | PROMPT | ALLOW
```

사용자 결정:

```text
allow_once | allow_for_conversation | deny
```

Approval protocol:

```text
approval.list
approval.get
approval.resolve
approval.cancel
```

`cwd`는 Run-bound Workspace의 root-relative directory만 허용한다. process environment는 빈 환경에서 시작해 명시적 `inherit[]`와 SecretRef만 point-of-use로 추가한다.

## 상태 전이

Approval:

```text
PENDING → APPROVED → CONSUMED
        → DENIED
        → EXPIRED
        → CANCELLED
```

Run:

```text
RUNNING
  → WAITING_APPROVAL
  → RUNNING (durable Tool result append + resume)
  → COMPLETED | FAILED | CANCELLED
```

Process:

```text
STARTING → RUNNING → EXITED
                  ↘ FAILED_TO_START
                  ↘ CANCELLED
Host ownership loss → ORPHANED
```

`APPROVED`만으로 process를 시작하지 않는다. `requestId + expectedVersion + bindingDigest` consume transaction의 단일 winner만 child를 시작한다.

## 실패 및 복구

- policy `DENY`: Tool error를 반환하고 process record/child는 0이다.
- `PROMPT`: ToolCall/ApprovalRequest를 먼저 저장하고 Run은 `WAITING_APPROVAL`이다.
- concurrent resolve: SQLite version predicate로 한 결정만 상태를 변경한다.
- binding mismatch: 승인되었어도 실행하지 않는다.
- duplicate consume: `APPROVAL_STATE_INVALID`로 실행하지 않는다.
- deny/cancel/expire: durable Tool error를 Conversation에 append하고 같은 Run을 재개한다.
- Host restart: pending approval은 유지되고 active process record는 `ORPHANED`로 복구된다.
- background cancel: child exit callback이 `CANCELLED`를 `EXITED`로 덮지 않는다.
- foreground output: stream completion을 확인한 뒤 bounded UTF-8 tail을 읽는다.
- SecretRef 실제 값: process 시작 직전에만 해석하며 SQLite/report/package에 저장하지 않는다.

## Acceptance

자동 gate는 다음을 실제 코드와 실행으로 검증한다.

- safe `ALLOW` direct execution
- policy `DENY` zero execution
- `PROMPT` before process start
- allow-once consume exactly once
- `allow_for_conversation` exact policy fingerprint only
- concurrent decision single winner
- binding mismatch rejection
- operator deny/cancel zero execution
- pending expiry zero execution
- pending approval survives database restart
- argv and explicit shell distinction
- background list/tail/cancel
- startup orphan recovery
- SecretRef point-of-use and SQLite literal zero
- Kernel `WAITING_APPROVAL` and durable resume
- WebSocket approval round trip in separate Host process
- STEP006/007/008 live regressions on schema 6
- build, type, unit, architecture, exports, evidence, issue, manifest, clean package gates

## 반복 방지 기록

STEP009에서 발견된 반복 결함은 다음 세트로만 종료한다.

```text
OR-ISSUE-020 typed approval interrupt wrapping
OR-ISSUE-021 process output stream completion race
OR-ISSUE-022 additive schema/protocol/Tool expectation drift
OR-ISSUE-023 synthetic Secret literal recurrence in final ZIP
```

각 항목은 `ENGINEERING_ISSUE_REGISTRY`, `reference/validation` 상세 증거, `RECURRENCE_PREVENTION_GATES` 자동 검사를 모두 가진다.

## 패키징 산출물

- 전체 source ZIP
- ZIP SHA-256
- `PACKAGE_MANIFEST.json`
- `STEP009_ACCEPTANCE_REPORT.txt`
- README/HANDOFF/PLANS/ROADMAP/VALIDATION
- Process/Approval contracts와 ADR
- OpenClaw evidence index/report
- Windows/POSIX acceptance launchers

ZIP은 `node_modules`, build output, runtime DB/WAL, Host metadata, private process output, `.env`, key/certificate, Secret 실제 값을 포함하지 않는다. fresh extraction에서 같은 acceptance와 manifest verification을 실행한다.

## 제외

- Docker/container sandbox
- remote process execution
- PTY/interactive terminal
- arbitrary host cwd
- inherited full Host environment
- OS-wide process adoption
- approval marketplace 또는 조직 정책 배포
- STEP010 Skill discovery와 immutable Run snapshot

## 완료 선언

Deterministic source acceptance는 `217/217 PASSED`다. Package manifest는 최종 문서와 report를 포함해 `470/470 VERIFIED`로 재생성한다. fresh-ZIP acceptance도 `217/217 PASSED`이며 packaged deterministic baseline으로 고정한다. 실제 Windows `pnpm acceptance:step009` 로그가 없으면 STEP009 Windows live accepted로 선언하지 않는다.
