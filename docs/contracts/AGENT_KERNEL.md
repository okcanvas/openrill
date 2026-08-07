# Agent Kernel Contract

## 책임

Agent Kernel은 durable Run을 하나의 provider-neutral 실행 loop로 처리한다.

1. Conversation ledger에서 메시지와 current attempt를 읽는다.
2. Model profile을 resolver로 해석한다.
3. RunAttempt에 provider/model/budget을 기록하고 RUNNING으로 전환한다.
4. Model stream을 RunEvent와 ModelInvocation에 투영한다.
5. Tool call을 순차 실행하고 Tool result를 durable message로 기록한다.
6. 다음 model turn을 수행하거나 terminal state로 닫는다.

## 불변조건

- model/tool 실행 전 durable Run/Attempt가 존재한다.
- model request 하나마다 ModelInvocation 하나가 존재한다.
- retry는 durable output이 발생하기 전에만 허용한다.
- 실제 provider request 수를 model-call budget에 포함한다.
- 동일 toolCallId와 동일 payload는 재실행하지 않고 기존 결과를 model context에 재투영한다.
- 동일 toolCallId와 다른 payload는 `AGENT_TOOL_CALL_CONFLICT`다.
- Tool은 STEP007에서 순차 실행한다.
- cancel signal은 model stream과 Tool execution에 전달된다.
- terminal usage와 reason을 RunAttempt에 기록한다.
- Kernel은 HTTP, WebSocket, SQLite implementation을 직접 import하지 않는다.

## Budget

`maxTurns`, `maxModelCalls`, `maxToolCalls`, `maxOutputTokens`를 실행 시작 시 snapshot으로 고정한다. 초과는 명시적 terminal reason으로 FAILED 처리한다.
