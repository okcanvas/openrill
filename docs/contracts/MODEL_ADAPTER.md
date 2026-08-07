# Model Adapter Contract

## 목적

OpenRill Agent Kernel과 외부 모델 API를 분리한다. Kernel은 HTTP, provider SDK, API key 형식이나 provider raw event를 알지 않는다.

## 공개 계약

- `ModelAdapterResolver.resolve(profile)`은 실행 시점에 profile을 adapter/provider/model/budget으로 해석한다.
- `ModelAdapter.stream(request)`은 `started`, `text_delta`, `reasoning_delta`, `tool_call`, `usage`, `completed`만 방출한다.
- 모든 provider adapter는 closed OpenRill model message와 tool definition을 provider payload로 투영한다.
- SecretRef는 resolver의 point-of-use에서만 값으로 해석한다. 값은 config snapshot, RunEvent, ModelInvocation, acceptance report에 기록하지 않는다.
- retryable transport failure와 auth/invalid request/provider rejection을 구분한다.
- stream이 terminal event 없이 끝나면 정상 완료가 아니다.

## Built-in adapter

`@openrill/model-openai-responses`는 built-in `fetch`와 SSE parser를 사용한다. SDK dependency, response storage, provider raw payload persistence는 없다.

## 제외

provider fallback chain, context compaction, multimodal input, cache control, provider SDK plugin은 이후 단계다.

## Provider-specific Tool-name projection

Canonical OpenRill Tool names are provider-neutral and may contain namespace dots. Provider adapters with a narrower grammar must project adapter-local aliases rather than changing canonical runtime names. The OpenAI Responses adapter uses deterministic collision-checked aliases, applies them to both Tool definitions and historical function-call input items, and reverses streamed function names before Kernel dispatch. Unknown aliases fail closed.

## OpenAI Responses streamed function identity
OpenAI `item_id`/item `id` and `call_id` are aliases for one streamed function call, not independent calls. Adapters must unify them, use `call_id` as the public Tool-call identity when available, reject conflicting identity graphs, and never emit a Tool call until a non-empty canonical Tool name is resolved.
