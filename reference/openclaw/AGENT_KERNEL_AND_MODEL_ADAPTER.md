# OpenClaw Agent/Model Reference Study

## 분석 범위

- `src/agents/embedded-agent-runner/run-entry.ts`
- `src/agents/embedded-agent-runner/run-loop.ts`
- `packages/agent-core/src/agent-loop.ts`
- `packages/ai/src/stream.ts`
- `packages/ai/src/providers/openai-responses.ts`
- `packages/ai/src/transports/openai-responses-stream-internal.ts`

## 확인한 구조

OpenClaw는 embedded run entry, prepared run loop, core model/tool loop를 분리한다. Tool call은 명시적인 sequential execution 함수에서 처리되며 provider registry와 OpenAI Responses transport도 Agent loop 외부에 있다. Responses stream은 output text, reasoning, function argument delta, usage, completed/incomplete/failure를 event 단위로 해석한다.

## OpenRill 채택

- Agent loop와 provider transport의 분리
- stream terminal event 검증
- tool argument delta 누적 후 closed JSON object 검증
- Tool 순차 실행
- retryable transport error와 terminal provider error 분류

## OpenRill 비채택

- OpenClaw package/type/event 이름
- OpenClaw provider registry API
- OpenClaw raw transcript format
- provider breadth와 compatibility alias
- manager hierarchy 또는 plugin-owned Kernel

근거는 `EVIDENCE_INDEX.json`의 `OC-AGENT-006..009`, `OC-MODEL-001..005`로 고정한다.
