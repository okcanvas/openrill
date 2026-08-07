# STEP012B — AUTOMATION SCHEDULER LIFECYCLE, LEASE, AND RECOVERY

## 목적

STEP012A가 고정한 AutomationJob/AutomationRun과 schema 8 위에 실제 wake lifecycle, transactional claim/lease, restart recovery, bounded catch-up, async shutdown quiescence를 구현한다. Conversation/model 실행은 주입형 executor 계약으로만 연결하고 Protocol/UI는 추가하지 않는다.

## 기준선

```text
current_revision=STEP012B_AUTOMATION_SCHEDULER_LIFECYCLE_LEASE_AND_RECOVERY
version=0.12.2-step012b
schema=8
official_accepted_baseline=STEP012AR1_ACCEPTANCE_REPORT_IMMUTABILITY_AND_MANIFEST_DIAGNOSTICS
accepted_checks=163/163
accepted_sha256=1f038edc3c21bf9ddff233fc079df80dd18289231d30045c84595e8ec0c6e257
```

## 코드 확인

STEP012AR1의 실제 코드는 다음 상태였다.

- `automation_jobs.next_scheduled_for`와 due index가 존재한다.
- `automation_runs`에는 PENDING/CLAIMED/RUNNING/terminal status와 lease owner/expiry가 존재한다.
- `(job_id, scheduled_for)` unique identity가 존재한다.
- `StateAutomationRepository`에는 job config/runtime와 PENDING run insert만 존재했다.
- Host는 Automation scheduler를 생성하거나 종료 순서에 포함하지 않았다.
- Protocol operation, Control UI route, Conversation Run executor 연결은 존재하지 않았다.

OpenClaw reference의 lifecycle/startup recovery/catch-up 코드를 검토했지만, OpenRill은 JSON store가 아니라 existing SQLite immediate transaction과 immutable occurrence identity를 사용한다. 따라서 reference의 in-memory reservation marker를 복제하지 않고 DB conditional update와 unique key를 사용한다.

## 구현 범위

- `AutomationScheduler`
- injected `AutomationExecutionContext` / `AutomationExecutionResult`
- due occurrence materialization and cursor advance in one SQLite transaction
- PENDING → CLAIMED → RUNNING → terminal lifecycle
- lease owner, expiry, renewal, lost-lease rejection
- startup recovery
- startup catch-up `SKIP|RUN_ONCE|BOUNDED`
- Host start/close composition
- focused lifecycle/lease/recovery tests
- STEP012AR1 full regression

## 공개 계약

Scheduler executor contract:

```text
input = immutable AutomationJob + AutomationRun snapshot
output = SUCCEEDED|FAILED, optional durable Conversation runId
```

`automation.enabled=true` without an executor fails Host startup. No silent no-op success and no fake execution is allowed. STEP012C owns the production Conversation Run executor.

## 상태 전이

```text
PENDING
  -> CLAIMED(owner, claimedAt, leaseExpiresAt, attempt+1)
  -> RUNNING(owner, renewed lease)
  -> SUCCEEDED|FAILED
```

Startup recovery:

```text
expired CLAIMED -> PENDING, lease cleared
expired RUNNING -> FAILED/AUTOMATION_INTERRUPTED_BY_RESTART, lease cleared
```

Running work is not blindly replayed after restart because its side effects may already have occurred. Unstarted claimed work is safe to requeue.

## Catch-up 계약

Startup에만 persisted catch-up policy를 적용한다.

- `SKIP`: 첫 overdue occurrence를 `SKIPPED/AUTOMATION_CATCH_UP_SKIPPED`로 기록하고 future cursor로 이동한다.
- `RUN_ONCE`: 가장 오래된 overdue occurrence 하나를 실행하고 나머지를 버린 뒤 future cursor로 이동한다.
- `BOUNDED(n)`: 가장 오래된 occurrence부터 최대 n개를 실행하고 나머지를 버린 뒤 future cursor로 이동한다.

정상 실행 중 wake는 job별 현재 due occurrence 하나를 materialize하고 schedule anchor에서 다음 occurrence를 계산한다. 한 wake의 job/run 수는 bounded limit를 갖는다.

## 실패 및 복구

- claim은 `status=PENDING` conditional UPDATE이므로 두 owner 중 하나만 승리한다.
- mark-running, renew, finish는 owner와 unexpired lease를 모두 확인한다.
- executor throw는 `AUTOMATION_EXECUTOR_ERROR`로 durable FAILED 처리한다.
- executor가 explicit FAILED를 반환하면 validated error code를 저장한다.
- success는 consecutive failures를 0으로 reset한다.
- failure/interrupted restart는 consecutive failures를 증가시킨다.
- scheduler close는 timer를 중지하고 in-flight wake/executor가 끝날 때까지 기다린다.
- Host는 readiness/metadata quiescence → Scheduler → RunCoordinator → ProcessManager → SQLite 순서로 닫는다.

## Acceptance

- startup SKIP/RUN_ONCE/BOUNDED
- regular due occurrence
- lease renewal
- explicit failure ledger
- two-owner single claim winner
- wrong-owner renew/finalize rejection
- expired CLAIMED requeue
- expired RUNNING fail-closed recovery
- async close quiescence
- Host executor fail-closed and injected execution
- no Automation protocol/UI/model coupling
- STEP012A focused regression
- canonical serial suite
- architecture/package exports
- STEP012AR1 actual Chromium regression
- packaged report immutability and manifest pre/post verification

## 반복 방지 기록

Existing OR-ISSUE-001 through OR-ISSUE-060 remain mandatory. OR-ISSUE-059 records historical manifest diagnostic identity drift. OR-ISSUE-060 records the Host readiness metadata write that survived close and produced post-test asynchronous activity. STEP012B adds recurrence gates for conditional claim SQL, owner/expiry predicates, conservative RUNNING recovery, bounded catch-up, async close order, and Protocol/UI absence.

Any actual Windows failure must receive a new OR-ISSUE entry, detailed validation evidence, and an executable gate before STEP closure.

## 패키징 산출물

- deterministic source ZIP
- SHA-256 sidecar
- package manifest
- source/fresh acceptance report identity
- README/HANDOFF/PLANS/ROADMAP/VALIDATION
- current plan and accepted-baseline evidence

## 제외

- Automation protocol CRUD/run-now/history operations
- ConversationService/AgentRunCoordinator production executor
- Control UI Automation page
- failure backoff and auto-disable enforcement
- disable-active cancellation policy
- event-driven trigger

These remain STEP012C/STEP012D or a later focused cut.

## 완료 선언

Windows에서 nested STEP012AR1 actual Chromium regression과 final STEP012B marker가 모두 통과하기 전에는 Windows-live accepted로 선언하지 않는다.
