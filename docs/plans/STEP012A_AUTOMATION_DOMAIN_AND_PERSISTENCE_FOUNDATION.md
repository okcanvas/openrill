# STEP012A — AUTOMATION_DOMAIN_AND_PERSISTENCE_FOUNDATION

## 목적

Scheduler timer, model execution, protocol, UI를 추가하기 전에 Automation의 시간 의미, config/runtime 경계, SQLite identity를 고정한다.

## 기준선

```text
accepted_baseline=STEP011R8 198/198 WINDOWS_LIVE_ACCEPTED
accepted_artifact_sha256=c1d7805ac2f1598085aa800755efe4c0fe8ec143a93c028907e226bbd6b116be
version=0.12.0-step012a
state_schema=8
```

## 코드 확인

STEP011R8 accepted source에서 확인한 시작 상태:

```text
packages/automation = identity stub only
state migrations    = 001..007
state automation tables = none
protocol automation operations = none
Host scheduler lifecycle = none
Control UI automation route = none
```

OpenClaw reference source에서 lifecycle facade와 next-run calculation이 분리되고 persisted cron job state가 존재함을 확인했지만, OpenRill 구현은 기존 synchronous SQLite transaction, repository, package-boundary 계약에 맞게 독립 구현한다.

## 구현 범위

- canonical AutomationJob/AutomationRun types
- schema migration `008_automation_domain_persistence.sql`
- StateAutomationRepository
- AutomationDefinitionService
- `at | interval | cron` validation
- IANA timezone validation
- deterministic `nextScheduledFor`
- optimistic config revision
- config/runtime update separation
- unique `(job_id, scheduled_for)` AutomationRun identity
- concurrent SQLite one-winner fixture

## 시간 계약

### at

- RFC3339 timestamp는 `Z` 또는 명시적 numeric offset을 반드시 포함한다.
- invalid calendar date와 invalid offset을 거부한다.
- 저장 시 UTC ISO string으로 정규화한다.
- enabled one-shot의 next occurrence가 현재보다 미래가 아니면 거부한다.

### interval

- `everyMs`는 1초 이상 365일 이하의 정수다.
- `anchorMs` 기준 정수 산술로 계산하고 previous execution time을 누적하지 않는다.
- 따라서 execution delay가 다음 schedule에 drift를 만들지 않는다.

### cron

- five-field `minute hour day-of-month month day-of-week`만 지원한다.
- numeric wildcard/list/range/step 문법만 허용한다. month/weekday names와 seconds field는 거부한다.
- day-of-month와 day-of-week가 모두 제한되면 Vixie OR semantics를 적용한다.
- 계산은 supplied IANA timezone의 wall-clock components를 기준으로 한다.

### DST

- spring-forward의 존재하지 않는 wall-clock minute는 실행하지 않고 다음 실제 matching instant로 이동한다.
- fall-back의 반복 wall-clock minute는 서로 다른 UTC instant이므로 각각 schedule occurrence다.
- `(job_id, scheduled_for)` unique key가 두 instant와 duplicate replay를 구분한다.

## 영속성 계약

`automation_jobs`는 config와 runtime columns를 함께 보존하지만 repository mutation path를 분리한다.

- config update: expected revision 필요, revision 증가
- runtime update: schedule cursor/failure counters만 변경, revision 불변
- config update는 runtime history를 보존한다.
- runtime update는 name/schedule/template/policy를 변경하지 않는다.

`automation_runs`는 `(job_id, scheduled_for)` unique이며 insert-on-conflict로 existing identity를 반환한다.

## 상태 전이

STEP012A는 AutomationRun `PENDING` identity까지만 생성한다. Claim, lease, Conversation Run binding, completion/failure transition은 STEP012B/C 소유다.

## 실패 및 복구

- invalid schedule/timezone/template/policy는 typed AutomationError로 fail-closed한다.
- stale revision은 `AUTOMATION_REVISION_CONFLICT`다.
- unknown job은 `AUTOMATION_JOB_NOT_FOUND`다.
- migration drift와 SQLite integrity는 기존 StateDatabaseError 계약을 유지한다.
- timer와 background service가 없으므로 shutdown side effect도 없다.

## Acceptance

- schema 7 → 8 sequential upgrade
- fresh schema 8
- migration inventory/checksum/integrity
- at normalization and past rejection
- interval no-drift arithmetic
- UTC and Asia/Seoul cron fixtures
- New York spring/fall DST fixtures
- invalid timezone/expression rejection
- config/runtime separation
- optimistic revision conflict
- JSON input detachment
- idempotent scheduled occurrence
- two simultaneous SQLite writer one-winner
- timer/model/protocol/UI side-effect zero
- canonical full suite
- actual STEP011 Chromium regression on Windows

## 반복 방지 기록

- OR-ISSUE-055 post-acceptance closure gap is registered and gated.
- OR-ISSUE-056 nested suite inventory drift is replaced by dynamic TAP/file ownership plus a 176-test floor.
- OR-ISSUE-057 shared historical live schema literals are replaced by the State owner constant.
- schema expectations are derived from `OPENRILL_STATE_SCHEMA_VERSION` in unit tests.
- current unit inventory is derived by the canonical runner.
- DST behavior is executable fixture, not prose only.
- database uniqueness is tested with two actual worker connections.

## 패키징 산출물

- source ZIP and SHA-256
- PACKAGE_MANIFEST.json
- deterministic acceptance report
- README/HANDOFF/PLANS/ROADMAP/VALIDATION
- Issue Registry and recurrence gates through OR-ISSUE-055

## 제외

- scheduler timer/wake loop
- lease claim/renew/recovery
- restart catch-up execution
- model or Conversation Run invocation
- automation protocol operations
- Control UI route

## 완료 선언

Container에서는 domain/state/canonical suite를 완전히 검증한다. STEP011 actual Chromium regression이 `runtime_unavailable`이면 Windows rerun 전 live accepted를 선언하지 않는다. Windows에서 nested STEP011과 STEP012A marker가 모두 PASSED일 때만 STEP012A를 Windows-live accepted로 승격한다.
