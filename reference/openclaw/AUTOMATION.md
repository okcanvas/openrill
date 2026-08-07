# Automation

관찰: service와 next-run 계산이 분리되고 SQLite job state가 존재한다: `[OC-CRON-001] src/cron/service.ts:25`, `[OC-CRON-002] src/cron/schedule.ts:55`, `[OC-STATE-005] src/state/openclaw-state-schema.sql:1295`.

채택: durable schedule, lease, catch-up, config/runtime state 분리.

변경: 초기에는 at/interval/cron만 지원한다.
