# ADR-0023 — Provider-neutral Agent Kernel

Status: Accepted

## 결정

Agent 실행 loop는 `@openrill/agent-kernel`이 소유하고 provider transport는 `@openrill/model-adapter` 구현으로 분리한다. 첫 실제 adapter는 별도 package `@openrill/model-openai-responses`다.

## 이유

OpenClaw 코드에서 Agent entry, prepared loop, core agent loop, provider registry와 Responses transport가 각각 다른 경계로 존재한다. OpenRill은 해당 문제 분리를 채택하되 OpenClaw 타입·event·package contract는 사용하지 않는다.

## 결과

- Provider 교체가 ledger와 Tool Runtime을 변경하지 않는다.
- Agent Kernel은 deterministic scripted adapter로 완전 테스트할 수 있다.
- API key는 Host composition resolver에서 point-of-use로만 해석된다.
- Tool breadth와 승인 정책은 STEP008/009까지 열지 않는다.
