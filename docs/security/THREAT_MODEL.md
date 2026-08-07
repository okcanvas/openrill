# Threat Model

## 주요 위협

1. 외부 웹/메시지의 prompt injection이 Shell/File Tool을 유도
2. reverse proxy 오설정으로 원격 사용자를 로컬로 오인
3. symlink/path traversal로 Workspace 탈출
4. 승인 replay 또는 binding 변경
5. 자동화가 사용자 부재 중 위험 Tool 실행
6. Plugin/Skill archive가 임의 코드 실행
7. 로그·event에 Secret 노출
8. sandbox 설정이 host 실행으로 우회

OpenClaw는 신뢰하지 않는 proxy header를 로컬 신뢰로 처리하지 않고 `[OC-GW-011] src/gateway/server/ws-connection/message-handler.ts:148`, workspace sandbox authority를 backend/tool policy까지 검사한다 `[OC-SANDBOX-003] src/agents/sandbox/workspace-authority.ts:138`. OpenRill도 동일 문제를 자체 계약으로 닫는다.
