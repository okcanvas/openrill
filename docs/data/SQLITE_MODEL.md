# SQLite Model

## 참조 관찰

OpenClaw는 논리 세션, transcript window, event, event identity를 분리하며 automation state도 SQLite에 둔다: `[OC-STATE-001] src/state/openclaw-agent-schema.sql:34`~`[OC-STATE-006] src/state/openclaw-state-schema.sql:1365`.

## OpenRill 초기 테이블

```text
schema_migrations
host_profiles
workspaces
conversations
messages
agent_runs
run_attempts
run_events
tool_calls
approval_requests
artifacts
skill_sources
skill_snapshots
automation_jobs
automation_runs
process_records
config_revisions
```

## 핵심 키

- `run_events UNIQUE(run_id, sequence)`
- `run_events UNIQUE(idempotency_key) WHERE idempotency_key IS NOT NULL`
- `tool_calls UNIQUE(run_id, provider_call_id)`
- `approval_requests UNIQUE(tool_call_id)`
- `automation_runs UNIQUE(job_id, scheduled_for)`

## 원칙

- WAL mode와 busy timeout
- foreign key on
- migration transaction
- fresh DB와 upgrade DB를 모두 테스트
- JSON column은 원문 보존에만 사용하고 query 핵심 값은 column으로 승격
- DB 파일 복사 전 checkpoint 또는 SQLite backup API 사용

## STEP014A delegation foundation

Schema 12 adds:

```text
run_budget_envelopes
run_delegations
run_delegation_events
run_delegation_waits
```

The delegation row stores a task digest only. Raw task text remains in the child Conversation message. Budget usage columns are observed facts and may exceed configured ceilings; enforcement is owned by service/kernel code so the actual overshoot remains auditable.
