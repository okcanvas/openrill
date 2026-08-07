# Conversation Contract

OpenClaw의 논리 session과 transcript generation 분리는 재시작·fork·rewrite 문제를 드러낸다: `[OC-STATE-001] src/state/openclaw-agent-schema.sql:34`, `[OC-STATE-002] src/state/openclaw-agent-schema.sql:114`.

OpenRill은 다음 aggregate를 사용한다.

- `Conversation`: 사용자에게 보이는 지속 단위
- `Message`: user/assistant/tool/system content
- `Run`: 한 input을 처리하는 실행
- `RunAttempt`: retry/recovery 단위
- `RunEvent`: append-only 증거

Conversation의 현재 상태를 JSON blob 하나에만 저장하지 않는다. message와 run/event는 개별 row이며 projection은 재생성 가능해야 한다.
