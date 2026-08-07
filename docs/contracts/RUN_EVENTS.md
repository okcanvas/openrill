# Run Events

참조 소스는 transcript event와 identity/idempotency를 분리한다: `[OC-STATE-003] src/state/openclaw-agent-schema.sql:336`, `[OC-STATE-004] src/state/openclaw-agent-schema.sql:379`. Tool start event도 core loop에서 명시한다: `[OC-AGENT-005] packages/agent-core/src/agent-loop.ts:668`.

## event envelope

```ts
type RunEvent = {
  eventId: string;
  runId: string;
  sequence: number;
  occurredAt: string;
  kind: RunEventKind;
  payload: unknown;
  idempotencyKey?: string;
};
```

## 초기 kind

- `run.started`, `run.completed`, `run.failed`, `run.cancelled`
- `model.turn.started`, `model.delta`, `model.turn.completed`
- `tool.requested`, `tool.started`, `tool.progress`, `tool.completed`, `tool.failed`
- `approval.requested`, `approval.resolved`, `approval.expired`
- `artifact.created`
- `recovery.detected`, `retry.scheduled`

`model.delta`는 UI stream용이며 retention/compaction 대상이다. final message와 Tool 결과는 authoritative record로 유지한다.
