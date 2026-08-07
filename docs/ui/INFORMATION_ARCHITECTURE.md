# UI Information Architecture

OpenClaw UI는 Gateway client를 별도 class로 두고 `[OC-UI-001] ui/src/api/gateway.ts:306`, chat과 approval을 독립 route로 둔다 `[OC-UI-002] ui/src/app-routes.ts:23`, `[OC-UI-003] ui/src/app-routes.ts:26`. OpenRill은 화면 배치를 복제하지 않고 더 작은 로컬 제품 IA를 사용한다.

## 초기 navigation

- Conversations
- Workspaces
- Automations
- Skills
- Approvals
- Artifacts
- Settings
- Diagnostics

## Conversation 화면

- 좌측: conversation 목록
- 중앙: user/assistant stream 및 Tool cards
- 우측 drawer: Run evidence, files changed, artifacts
- inline approval: exact command/path/risk/binding diff
- reconnect 시 snapshot + sequence 이후 event replay
