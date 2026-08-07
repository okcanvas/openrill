# Agent Execution

관찰: inbound projection부터 core tool loop까지 단계가 분리된다: `[OC-MSG-001] src/auto-reply/dispatch.ts:442`~`[OC-AGENT-005] packages/agent-core/src/agent-loop.ts:668`.

채택: context snapshot, model turn/tool loop, retry 분류, event streaming.

변경: 로컬 OpenRill Kernel은 자체 Provider/Tool contract를 사용한다.
