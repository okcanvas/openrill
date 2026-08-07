# Sandbox

관찰: backend handle/factory와 workspace authority 검증이 분리된다: `[OC-SANDBOX-001] src/agents/sandbox/backend-handle.types.ts:59`~`[OC-SANDBOX-003] src/agents/sandbox/workspace-authority.ts:138`.

채택: backend abstraction, confinement proof, policy coupling.

변경: MVP host execution을 정직하게 표시하고 Docker는 STEP015에서 추가한다.
