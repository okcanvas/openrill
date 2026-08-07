# Session and State

관찰: 논리 세션, transcript generation, event, identity가 분리된다: `[OC-STATE-001] src/state/openclaw-agent-schema.sql:34`~`[OC-STATE-004] src/state/openclaw-agent-schema.sql:379`.

채택: Conversation/Run/Event 분리, append-only, idempotency.

변경: OpenClaw 테이블/entry_json/session window 계약을 사용하지 않는다.
