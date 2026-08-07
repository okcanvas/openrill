# STEP011R7 ProcessManager async close and Windows child quiescence

## 목적

실제 Windows STEP011R6 canonical suite의 추가 file-level failure를 코드와 TAP 집계로 확정하고, background child callback이 SQLite 종료 이후 실행되지 않도록 shutdown 경계를 닫는다.

## 기준선

```text
source=STEP011R6_VUE_PROXY_SAFE_PROJECTION_BOUNDARY
version=0.11.6-step011r6
Windows=170/172 FAILED
schema=7
framework=VUE_3
```

공식 accepted baseline은 계속 STEP010AR1 `121/121 ACCEPTED`다.

## Windows 실패 증거

```text
process-approval-step009.test.mjs = file-level not ok
expected tests=155
actual tests=156
pass=155
fail=1
skipped=0
```

등록된 assertion 하나가 실패한 경우가 아니라 모든 155개 성공 뒤 file wrapper 실패가 하나 추가된 형태다.

## 코드 확인

- STEP009 fixture는 background child를 생성한다.
- R6 `ProcessManager.close()`는 `kill()`만 호출하고 child `close`와 stream 완료를 기다리지 않는다.
- fixture는 즉시 SQLite를 닫고 temp root를 삭제한다.
- background `close/error` callback은 durable process row를 갱신하기 위해 SQLite transaction을 수행한다.
- R6 acceptance extractor는 file-level failure 직전의 asynchronous-activity `# Error:` line을 보존하지 않는다.

## 구현 범위

- `ProcessManager.close(): Promise<void>`
- close idempotence와 new-run rejection
- background child settlement/stream quiescence tracking
- existing terminal process status 보존
- Host shutdown order: active Runs → ProcessManager → SQLite
- STEP009 fixture async cleanup과 bounded Windows removal
- delayed fake-child focused tests
- asynchronous TAP diagnostic 보존
- Issue Registry, recurrence gate, deterministic package

## 공개 계약

```text
await processManager.close()
```

`close()` 완료 후에는 manager가 소유한 background child callback과 output stream finalization이 남지 않는다. process/approval/UI/schema 공개 계약은 변경하지 않는다.

## 상태 전이

```text
RUNNING background child
→ close requested
→ durable CANCELLED
→ child close/error observed
→ output streams settled
→ ProcessManager close resolved
→ SQLite close
```

## 실패 및 복구

- child finalization transaction 실패는 비동기 uncaught exception으로 방출하지 않고 close Promise에서 전달한다.
- close가 시작된 뒤 새 process run은 거부한다.
- terminal 상태는 delayed child close가 `EXITED`로 덮지 않는다.
- actual Chromium regression은 계속 STEP011 nested acceptance에서 수행한다.

## Acceptance

- focused async close tests 4/4
- canonical serial suite 159/159
- unit files 29, skipped zero, concurrency 1
- architecture/export pass
- STEP011 feature regression
- source/fresh report byte identity
- manifest/ZIP deterministic identity
- Windows actual Chromium rerun

## 반복 방지 기록

```text
OR-ISSUE-053 Windows async child finalization after test completion
```

상세 실패 증거와 자동 recurrence gate를 함께 유지한다.

### 현재 컨테이너 경계

```text
Focused process close   4/4 PASSED
Canonical suite         159/159 PASSED
Canonical repeated      5/5 PASSED
STEP011 local           215/227 runtime_unavailable
STEP011R7 local         184/185 runtime_unavailable
```

exact Vue 3.5.40 tarball 획득과 actual Chromium full regression은 Windows live acceptance에서 확인한다. 이 항목을 로컬 통과로 간주하지 않는다.

## 패키징 산출물

```text
openrill-step011r7-process-manager-async-close-windows-child-quiescence-v1.zip
```

## 제외

- Chromium/Vue/CSP/approval TTL 계약 재변경
- process tree 또는 OS service supervisor 도입
- STEP012 scheduler 구현

## 완료 선언

source와 fresh ZIP deterministic 검증 후 Windows에서 nested STEP011과 STEP011R7 marker가 모두 PASSED일 때만 STEP011 promotion 후보로 본다.
