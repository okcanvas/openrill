# Sandbox

OpenClaw는 backend factory/handle을 분리하고 `[OC-SANDBOX-001] src/agents/sandbox/backend-handle.types.ts:59`, `[OC-SANDBOX-002] src/agents/sandbox/backend.types.ts:46`, 실제 workspace confinement 가능 여부를 정책과 함께 검사한다 `[OC-SANDBOX-003] src/agents/sandbox/workspace-authority.ts:138`.

OpenRill MVP는 host execution을 명시적으로 표시하고 승인한다. STEP015에서 Docker backend를 추가한다.

Sandboxed 표시 조건:

- session 전용 container
- Workspace mount가 지정된 ro/rw 계약과 일치
- host path 추가 bind 없음
- host browser/control/session 접근 없음
- Shell이 sandbox backend 밖으로 routing되지 않음
- 허용 Tool이 confinement 가능한 surface로 제한됨

조건 하나라도 깨지면 UI에 `Sandboxed`로 표시하지 않는다.
