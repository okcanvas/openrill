# STEP007 — AGENT_KERNEL_AND_MODEL_ADAPTER

## 목적

Windows-live-accepted STEP006A ledger 위에 provider-neutral streaming Agent Kernel과 첫 실제 provider adapter를 추가한다.

## 기준선

- 입력: `STEP006A_WINDOWS_UTF8_TEXT_IO`, version `0.6.1-step006a`
- 출력: `STEP007_AGENT_KERNEL_AND_MODEL_ADAPTER`, version `0.7.0-step007`
- SQLite schema target: `4`

## Reference Evidence

- `OC-AGENT-006..009`: entry, prepared loop, core loop, sequential Tool execution
- `OC-MODEL-001..005`: provider runtime, Responses adapter, event loop, function argument delta, terminal events
- 전체 OpenClaw evidence `113/113`

## OpenClaw 문제 분석

OpenClaw에는 실전 기능이 풍부하지만 Agent runner, provider compatibility, channel/product surface가 넓다. OpenRill STEP007은 Run ledger를 중심으로 최소 closed contract만 열고 provider transport를 별도 package로 둔다.

## 구현 범위

- `packages/model-adapter`: provider-neutral request/stream/error/resolver
- `packages/model-openai-responses`: built-in fetch + SSE adapter
- `packages/tool-runtime`: closed registry와 sequential execution
- `packages/agent-kernel`: model/tool turn loop, budget, cancel, retry
- `packages/state`: migration 004, RunAttempt usage, ModelInvocation ledger
- `packages/conversations`: execution context와 terminal transition API
- `services/agent-host`: configured resolver, active Run coordinator
- Local Protocol `conversation.send`에서 새 Run 비동기 schedule

## 공개 계약

세부 계약은 `docs/contracts/MODEL_ADAPTER.md`와 `docs/contracts/AGENT_KERNEL.md`를 따른다.

## 상태 전이

`CREATED → RUNNING → COMPLETED | FAILED | CANCELLED`.

Model request마다 `STARTED → COMPLETED | FAILED | CANCELLED` ModelInvocation을 기록한다. Retry는 새 request number와 invocation을 만든다.

## 실패 및 복구

- auth/invalid profile은 non-retryable
- transport/rate/5xx는 durable output 전, bounded retry만 허용
- partial text/tool event 이후 retry 금지
- malformed Tool arguments, duplicate Tool conflict, budget 초과는 stable Agent terminal reason
- Host shutdown은 active Run AbortController를 중단하고 await한 후 DB를 닫는다

## Acceptance

- text-only durable completion
- Tool roundtrip과 sequential execution
- retryable pre-output failure와 실제 request count
- model call budget
- OpenAI Responses local SSE fixture
- 별도 Host process + local provider + SecretRef point-of-use + assistant persistence
- schema 4 and ModelInvocation ledger
- STEP006 core ledger regression
- issue registry와 recurrence gate 존재
- unit/build/architecture/export
- package/fresh-ZIP manifest determinism

## 반복 방지 기록

`docs/governance/ENGINEERING_ISSUE_REGISTRY.md`와 `docs/testing/RECURRENCE_PREVENTION_GATES.md`를 STEP 종료 계약으로 검사한다. 실제 신규 실패는 registry ID, 상세 증거, 자동 gate 없이 닫지 않는다.

## 패키징 산출물

source ZIP, SHA-256, package manifest, project tree, acceptance report, README/HANDOFF/VALIDATION 갱신본.

## 제외

filesystem/process/browser Tool, approval resume, Skill prompt assembly, fallback provider, multimodal, artifact, background daemon.

## 완료 선언

Deterministic gate와 fresh-ZIP gate 후 Windows 실제 `pnpm acceptance:step007` 로그가 있어야 Windows live accepted다.

## Deterministic 결과

- STEP007 `112/112 PASSED`
- Unit `70/70 PASSED` across 16 files
- OpenClaw evidence `113/113`
- Package manifest `423/423`
- Fresh ZIP acceptance and post-rerun manifest verification PASSED
