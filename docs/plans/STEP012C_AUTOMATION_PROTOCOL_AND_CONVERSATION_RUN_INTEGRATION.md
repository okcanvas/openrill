# STEP012C — AUTOMATION_PROTOCOL_AND_CONVERSATION_RUN_INTEGRATION

## 목적

STEP012BR1에서 Windows-live accepted된 scheduler kernel에 closed Local Protocol operations와 production Conversation Run executor를 연결한다. 수동 실행 idempotency와 AutomationRun↔AgentRun 관계를 SQLite에 먼저 기록하여 재접속·lease loss·Host 종료에도 실행 identity가 보존되도록 한다.

## 기준선

```text
official_accepted=STEP012BR1_HISTORICAL_ACCEPTANCE_BASELINE_OWNERSHIP
accepted_checks=187/187
accepted_schema=8
accepted_zip_sha256=b90721d4d24f7467355f1f2dcd7e94d65f03517a7f60ff8208fa0c915f6ccbde
current=STEP012C_AUTOMATION_PROTOCOL_AND_CONVERSATION_RUN_INTEGRATION
version=0.12.5-step012cr1
schema=9
```

## 코드 확인

- STEP012BR1 scheduler는 injected executor만 알고 Protocol/Conversation을 직접 import하지 않았다.
- WebSocket 연결 메모리 idempotency만으로 `run-now`를 보호하면 재접속 후 같은 요청이 중복 실행된다.
- AgentRun ID를 executor 종료 시점에만 저장하면 model 실행 뒤 lease loss/Host interruption에서 orphan linkage가 생긴다.
- AgentRunCoordinator는 approval 대기 후 재개를 포함한 terminal completion을 executor에게 제공하지 않았다.
- historical STEP011/STEP012 acceptance에는 current schema owner가 아닌 schema 8 literal이 남아 있었다.

## 구현 범위

- schema 9 migration: `trigger_kind`, durable `request_key`, partial unique manual-request index;
- `automation.create/list/get/update/run_now/history` closed protocol operations;
- permission: `automation.read`, `automation.write`, `automation.execute`;
- durable manual request replay and cross-job conflict;
- production `AutomationConversationExecutor`;
- Conversation 생성, prompt submission, AgentRun 생성;
- model 실행 전에 owner/nonexpired-lease 조건으로 AutomationRun에 AgentRun ID 결합;
- approval wait/resume를 포함한 AgentRun terminal wait;
- explicit `automation.job.updated`, `automation.run.updated`, `conversation.updated` notices;
- scheduler/Host close 시 active production execution abort와 quiescence;
- OR-ISSUE-062 historical schema ownership correction.

## 공개 계약

```text
automation.create
automation.list
automation.get
automation.update
automation.run_now
automation.history
```

모든 input은 unknown key를 거부하는 closed schema다. `run_now`는 caller가 제공한 bounded `requestKey`를 durable unique identity로 사용한다. 동일 requestKey와 동일 job은 기존 AutomationRun을 반환하고, 다른 job과의 재사용은 conflict다.

## 상태 전이

```text
manual request
→ MANUAL/PENDING AutomationRun durable reserve
→ scheduler claim/lease
→ RUNNING
→ Conversation + AgentRun 생성
→ AutomationRun.run_id pre-execution bind(owner + nonexpired lease)
→ AgentRun terminal wait
→ SUCCEEDED | FAILED
```

Approval이 필요하면 AgentRun은 `WAITING_APPROVAL`에 머물며 Automation executor는 terminal로 오판하지 않는다. approval resolution 후 coordinator resume가 동일 terminal waiter를 완료한다.

## 실패 및 복구

- schema/request identity conflict는 stable Automation protocol error로 반환한다.
- run ID bind는 RUNNING, same owner, nonexpired lease만 허용한다.
- executor throw는 durable AutomationRun failure로 기록한다.
- scheduler close는 AbortSignal을 전파해 active Conversation Run을 cancel한 뒤 SQLite close 전에 기다린다.
- lease를 잃은 executor는 성공 commit을 할 수 없다.
- actual nested historical regression은 current State schema owner를 따른다.

## Acceptance

- migration 009 fresh/upgrade/index/constraint;
- durable manual replay, same-millisecond collision, cross-job conflict;
- closed nested protocol validation;
- permission and stable error mapping;
- actual SQLite + ConversationService + scripted model + AgentRunCoordinator + Scheduler integration;
- AgentRun ID가 model execution 전에 durable bind됨을 증명;
- explicit domain notices;
- approval-aware terminal wait;
- scheduler close abort/quiescence;
- STEP012A 14/14, STEP012B 10/10, historical ownership 4/4 regression;
- current canonical serial suite, architecture, exports;
- nested STEP012BR1 actual Windows Chromium regression;
- package manifest pre/post and report immutability.

## 반복 방지 기록

- OR-ISSUE-062 상세 증거와 historical schema owner gate를 추가한다.
- run-now idempotency는 process memory가 아니라 SQLite unique identity로 강제한다.
- AutomationRun↔AgentRun binding은 execution 전 owner/lease-guarded transaction으로 강제한다.
- UI가 추론하지 않도록 Automation domain notice를 명시적으로 발행한다.

## 패키징 산출물

- deterministic source ZIP;
- SHA-256 sidecar;
- `PACKAGE_MANIFEST.json`;
- canonical STEP012C acceptance report;
- README/HANDOFF/PLANS/ROADMAP/VALIDATION continuation documents.

## 제외

- Control UI Automation route/page/action;
- failure backoff/automatic disable;
- disable-active cancellation policy;
- event-driven trigger;
- distributed scheduler authority beyond SQLite lease ownership.

이 항목은 STEP012D 또는 별도 후속 cut에서 계약을 먼저 정의한 뒤 구현한다.

## 완료 선언

STEP012C는 Windows에서 nested STEP012BR1 actual Chromium regression과 최종 STEP012C marker가 모두 통과하기 전까지 candidate다. 정적 source gate나 mocked-only smoke를 Windows-live acceptance로 간주하지 않는다.
