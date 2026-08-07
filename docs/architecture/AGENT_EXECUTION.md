# Agent Execution

## 관찰된 실행 경로

채널 입력은 공통 dispatcher로 투영된 뒤 설정 기반 reply, reply agent, embedded runner, prepared loop, core agent loop로 내려간다: `[OC-MSG-001] src/auto-reply/dispatch.ts:442`~`[OC-AGENT-004] packages/agent-core/src/agent-loop.ts:108`.

## OpenRill 실행 경로

```text
ConversationCommand
 → RunAdmission
 → RunContextSnapshot(config/workspace/skills/model/policy)
 → ModelTurn
 → streamed assistant parts
 → zero or more ToolCall
 → ToolPolicyEvaluation
 → Execute | SuspendForApproval | Deny
 → ToolResult append
 → next ModelTurn
 → Complete | Failed | Cancelled
```

## Run snapshot

Run 시작 시 다음을 고정한다.

- materialized config revision
- workspace identity/root/policy revision
- selected model adapter/model
- skill snapshot ids/hash
- available Tool schema hash
- permission policy revision

실행 중 설정이 바뀌어도 현재 Run은 snapshot을 사용한다. 다음 Run부터 새 설정을 사용한다.

## retry 분류

- transport retry: 같은 model turn idempotency 범위 내 제한 재시도
- context recovery: Tool 결과 축약 또는 transcript 재구성 후 새 attempt
- model fallback: 명시된 Provider policy가 있을 때만
- tool retry: Tool별 retry contract가 있을 때만
- user correction: 자동 retry가 아니라 새 user message

## Delegation budget foundation

Before public child execution, every participating Run may have a durable envelope containing cumulative turn/model/Tool/token/time limits, delegation depth/child limits, deadline, and allowed workspace/Skill/Tool sets. Child creation reserves only remaining parent capacity and never widens scope.
