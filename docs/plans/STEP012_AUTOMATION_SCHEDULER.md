# STEP012 — AUTOMATION_SCHEDULER

## 목적

durable at/interval/cron Automation을 도메인, scheduler, protocol/Conversation integration, UI 순서로 분리 구현한다.

## Reference Evidence

- `[OC-CRON-001] src/cron/service.ts:25` — scheduler lifecycle/read/mutation/run 경계 분리 참고.
- `[OC-CRON-002] src/cron/schedule.ts:55` — schedule next-fire 계산 참고.
- `[OC-STATE-005] src/state/openclaw-state-schema.sql:1295` — durable job persistence 참고.
- OpenRill은 OpenClaw의 JSON reservation을 복제하지 않고 SQLite transaction과 unique occurrence identity를 사용한다.

## Cut 상태

### STEP012A / STEP012AR1 — Windows accepted

- canonical AutomationJob/AutomationRun
- schema 8 `automation_jobs`, `automation_runs`
- at/interval/cron, IANA timezone, DST
- config/runtime mutation separation
- unique `(job_id, scheduled_for)`
- accepted closure: STEP012AR1 Windows `163/163`
- accepted ZIP SHA-256: `1f038edc3c21bf9ddff233fc079df80dd18289231d30045c84595e8ec0c6e257`

### STEP012B / STEP012BR1 — Windows accepted

- wake/timer lifecycle
- transactional due materialization and claim
- lease renewal and owner-guarded completion
- expired claim/running restart recovery
- `SKIP|RUN_ONCE|BOUNDED` startup catch-up
- async shutdown quiescence
- injected executor, Host fail-closed startup
- accepted closure: STEP012BR1 Windows `187/187`
- accepted ZIP SHA-256: `b90721d4d24f7467355f1f2dcd7e94d65f03517a7f60ff8208fa0c915f6ccbde`

### STEP012C — current candidate

- closed Local Protocol automation operations
- durable run-now request identity
- production Conversation Run executor and pre-execution durable run linkage
- approval-aware terminal wait and Automation domain notices
- schema 9

### STEP012D — planned

- Control UI Automation pages
- create/edit/enable/disable/run-now/history
- actual Windows Chromium vertical slice

## 공개 계약과 불변조건

- AutomationJob config update는 revision conflict를 검사한다.
- runtime cursor/last/failure mutation은 config revision을 증가시키지 않는다.
- 동일 `(job_id, scheduled_for)` occurrence는 하나뿐이다.
- claim/renew/finish는 status, owner, nonexpired lease를 transaction에서 검증한다.
- startup recovery는 expired CLAIMED와 RUNNING을 서로 다른 의미로 처리한다.
- scheduler close는 SQLite close 전 quiescence를 보장한다.

## 현재 제외

- failure backoff와 auto-disable
- disable 중 active run cancellation policy
- event-driven triggers
- distributed clock authority beyond SQLite lease ownership

## 완료 선언

각 cut은 자신의 명시 범위와 이전 accepted regression이 모두 통과한 뒤에만 완료한다. 정적 분석이나 mocked smoke만으로 Windows live acceptance를 선언하지 않는다.
