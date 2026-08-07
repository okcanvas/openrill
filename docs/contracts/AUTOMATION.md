# Automation Contract

OpenClaw scheduler는 service lifecycle과 next-run 계산을 분리하고 job을 SQLite에 보존한다: `[OC-CRON-001] src/cron/service.ts:25`, `[OC-CRON-002] src/cron/schedule.ts:55`, `[OC-STATE-005] src/state/openclaw-state-schema.sql:1295`.

## schedule type

- `at`: 일회 실행
- `interval`: 고정 간격
- `cron`: cron expression + timezone

event trigger는 Connector 수용 이후 별도 STEP에서 추가한다.

## config/runtime 분리

- config: name, enabled, schedule, prompt, workspace, delivery
- runtime: nextRunAt, lastRunAt, consecutiveFailures, activeRunId, lease

runtime 변화 때문에 사용자 config 전체를 다시 쓰지 않는다.

## catch-up

- one-shot past due: 한 번 실행 또는 expire 정책
- recurring: missed interval을 무제한 재생하지 않고 최신 1회만 catch-up 기본
- active duplicate: job lease로 차단
