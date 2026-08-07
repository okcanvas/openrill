# OpenClaw Evidence Index

이 문서는 `EVIDENCE_INDEX.json`의 사람이 읽을 수 있는 색인이다. 경로·라인·발췌문은 별도 원본 소스에 대해 재검증한다.

| ID | Domain | Source | Observation |
|---|---|---|---|
| `OC-ID-001` | identity | `package.json:2` | 패키지 이름은 openclaw이다. |
| `OC-ID-002` | identity | `package.json:3` | 분석 기준 버전은 2026.7.2이다. |
| `OC-ID-003` | identity | `package.json:16` | 소스 라이선스는 MIT이다. |
| `OC-CLI-001` | cli | `openclaw.mjs:11` | 런처가 지원 Node 런타임 하한을 직접 검사한다. |
| `OC-CLI-002` | cli | `openclaw.mjs:141` | 런처가 자식 프로세스 respawn과 signal 전달을 소유한다. |
| `OC-CLI-003` | cli | `src/entry.ts:35` | TypeScript 진입점이 wrapper/entry 관계를 확인한다. |
| `OC-CLI-004` | cli | `src/cli/run-main.ts:158` | gateway run에 대한 빠른 경로가 존재한다. |
| `OC-CLI-005` | cli | `src/cli/run-main.ts:1530` | 검증된 설정 이후 플러그인 CLI를 지연 등록한다. |
| `OC-GW-001` | gateway | `src/cli/gateway-cli/run-loop.ts:118` | Gateway 수명주기 루프가 별도 함수로 분리되어 있다. |
| `OC-GW-002` | gateway | `src/gateway/server-start.ts:101` | Gateway 서버 시작이 별도 진입점으로 분리되어 있다. |
| `OC-GW-003` | gateway | `src/gateway/server-start.ts:109` | 시작 단계가 bootstrap으로 시작한다. |
| `OC-GW-004` | gateway | `src/gateway/server-start.ts:117` | bootstrap 다음 runtime state 준비 단계가 있다. |
| `OC-GW-005` | gateway | `src/gateway/server-start.ts:130` | lifecycle 준비 단계가 분리되어 있다. |
| `OC-GW-006` | gateway | `src/gateway/server-start.ts:151` | core runtime 시작 단계가 분리되어 있다. |
| `OC-GW-007` | gateway | `src/gateway/server-start.ts:163` | listen 이후 후속 시작 단계를 완료한다. |
| `OC-GW-008` | gateway | `src/gateway/server-runtime-state.ts:299` | HTTP 서버와 분리된 noServer WebSocket 구성이 사용된다. |
| `OC-GW-009` | gateway | `src/gateway/server-runtime-state.ts:334` | listen 전에 upgrade handler를 결합한다. |
| `OC-GW-010` | gateway | `src/gateway/server/ws-connection/message-handler.ts:75` | WebSocket 메시지 핸들러가 handshake/auth/request dispatch를 소유한다. |
| `OC-GW-011` | gateway | `src/gateway/server/ws-connection/message-handler.ts:148` | 신뢰하지 않는 proxy header를 로컬 신뢰로 승격하지 않는다. |
| `OC-GW-012` | gateway | `src/infra/gateway-lock.ts:30` | Gateway lock payload는 PID, owner ID, 생성 시각과 실행 identity를 기록한다. |
| `OC-GW-013` | gateway | `src/infra/gateway-lock.ts:236` | stale lock 회수 여부는 별도 함수에서 owner 생존성과 lock age를 판정한다. |
| `OC-GW-014` | gateway | `src/infra/gateway-lock.ts:359` | Gateway lock 획득은 서버 시작과 분리된 공개 lifecycle 경계다. |
| `OC-GW-015` | gateway | `src/cli/gateway-cli/run-loop.ts:150` | run loop는 server handle을 만들기 전에 lock을 획득한다. |
| `OC-GW-016` | gateway | `src/cli/gateway-cli/run-loop.ts:154` | listener readiness와 close handle 반환 사이의 startup signal race를 명시적으로 다룬다. |
| `OC-GW-017` | gateway | `src/gateway/server-start.ts:178` | startup 단계 실패 시 전용 rollback close를 실행한다. |
| `OC-GW-018` | gateway | `src/gateway/server-start.ts:187` | 정상 시작 뒤 close handler를 생성하여 shutdown composition을 캡슐화한다. |
| `OC-PROTO-001` | protocol | `packages/gateway-protocol/src/version.ts:2` | Gateway 프로토콜 버전을 명시한다. |
| `OC-PROTO-002` | protocol | `packages/gateway-protocol/src/schema/frames.ts:33` | 초기 연결 파라미터가 닫힌 스키마로 정의된다. |
| `OC-PROTO-003` | protocol | `packages/gateway-protocol/src/schema/frames.ts:76` | 성공 handshake가 기능·snapshot·정책을 반환한다. |
| `OC-PROTO-004` | protocol | `packages/gateway-protocol/src/schema/frames.ts:156` | 요청 envelope가 별도 스키마이다. |
| `OC-PROTO-005` | protocol | `packages/gateway-protocol/src/schema/frames.ts:165` | 응답 envelope가 별도 스키마이다. |
| `OC-PROTO-006` | protocol | `packages/gateway-protocol/src/schema/frames.ts:174` | 서버 event envelope가 별도 스키마이다. |
| `OC-PROTO-007` | protocol | `packages/gateway-protocol/src/frame-guards.ts:37` | 전체 스키마와 별개로 dispatch 핵심 필드의 경량 guard가 있다. |
| `OC-MSG-001` | message | `src/auto-reply/dispatch.ts:442` | 채널 입력이 공통 inbound dispatcher로 진입한다. |
| `OC-MSG-002` | message | `src/auto-reply/dispatch.ts:746` | 채널별 입력을 공통 계약으로 투영하는 경로가 있다. |
| `OC-MSG-003` | message | `src/auto-reply/reply/dispatch-from-config.ts:22` | 설정 기반 reply dispatch가 별도 계층이다. |
| `OC-AGENT-001` | agent | `src/auto-reply/reply/agent-runner-run.ts:70` | reply agent 실행이 세션·모델·전달 계층을 조정한다. |
| `OC-AGENT-002` | agent | `src/agents/embedded-agent-runner/run-entry.ts:192` | embedded agent 실행 진입점이 별도로 존재한다. |
| `OC-AGENT-003` | agent | `src/agents/embedded-agent-runner/run-loop.ts:58` | 준비된 실행은 복구·재시도 가능한 loop로 처리된다. |
| `OC-AGENT-004` | agent | `packages/agent-core/src/agent-loop.ts:108` | 모델 turn과 tool execution을 반복하는 core loop가 별도 패키지에 있다. |
| `OC-AGENT-005` | agent | `packages/agent-core/src/agent-loop.ts:668` | tool 시작 event가 명시적으로 발생한다. |
| `OC-STATE-001` | state | `src/state/openclaw-agent-schema.sql:34` | 논리 세션 레코드를 별도 테이블로 유지한다. |
| `OC-STATE-002` | state | `src/state/openclaw-agent-schema.sql:114` | transcript generation/window를 논리 세션과 분리한다. |
| `OC-STATE-003` | state | `src/state/openclaw-agent-schema.sql:336` | transcript event를 순번 기반으로 저장한다. |
| `OC-STATE-004` | state | `src/state/openclaw-agent-schema.sql:379` | event identity/idempotency를 별도 테이블로 관리한다. |
| `OC-STATE-005` | state | `src/state/openclaw-state-schema.sql:1295` | 자동화 job을 SQLite에 영속화한다. |
| `OC-STATE-006` | state | `src/state/openclaw-state-schema.sql:1365` | job 공개 설정을 JSON으로 보존한다. |
| `OC-CONFIG-001` | config | `src/config/io.factory.ts:21` | 설정 IO를 context/factory로 캡슐화한다. |
| `OC-CONFIG-002` | config | `src/config/io.load.ts:34` | 설정 load가 env/include/validation/recovery 단계를 조정한다. |
| `OC-CONFIG-003` | config | `src/config/io.write.ts:100` | 설정 쓰기가 별도 경계와 안전 절차를 갖는다. |
| `OC-CONFIG-004` | config | `src/config/includes.ts:561` | 설정 include를 경계 검사와 함께 처리한다. |
| `OC-CONFIG-005` | config | `src/config/env-substitution.ts:201` | 환경 변수 치환을 명시적 문법과 오류로 처리한다. |
| `OC-CONFIG-006` | config | `src/config/future-version-guard.ts:1` | 미래 버전 설정에 대한 guard가 있다. |
| `OC-APPROVAL-001` | approval | `src/infra/exec-approvals-core.ts:9` | 실행 보안 레벨이 타입으로 정의된다. |
| `OC-APPROVAL-002` | approval | `src/infra/exec-approvals-core.ts:10` | 승인 요청 정책이 타입으로 정의된다. |
| `OC-APPROVAL-003` | approval | `src/infra/exec-approvals-core.ts:12` | 승인 결정 값이 제한된다. |
| `OC-APPROVAL-004` | approval | `src/gateway/exec-approval-manager.ts:221` | 승인 대기·만료·해결 수명주기를 전담하는 manager가 있다. |
| `OC-SKILL-001` | skills | `src/skills/loading/skill-contract.ts:4` | Skill의 이름·설명·경로·promptVersion 계약이 존재한다. |
| `OC-SKILL-002` | skills | `src/skills/loading/skill-contract.ts:38` | Skill catalog를 모델 prompt로 투영한다. |
| `OC-SKILL-003` | skills | `src/skills/loading/local-loader.ts:115` | 로컬 Skill 탐색이 이름·경로 안전성 검사를 수행한다. |
| `OC-SKILL-004` | skills | `src/skills/loading/workspace.ts:1751` | 번들·사용자·workspace·plugin Skill을 통합한다. |
| `OC-CRON-001` | automation | `src/cron/service.ts:25` | 스케줄러가 lifecycle/read/mutation/run 작업을 분리한다. |
| `OC-CRON-002` | automation | `src/cron/schedule.ts:55` | at/every/cron/event schedule의 다음 실행을 계산한다. |
| `OC-PLUGIN-001` | plugins | `src/plugins/discovery.ts:1402` | 플러그인 탐색이 별도 보안 경계를 갖는다. |
| `OC-PLUGIN-002` | plugins | `src/plugins/manifest.ts:27` | 플러그인 manifest 파일명이 고정되어 있다. |
| `OC-PLUGIN-003` | plugins | `src/plugins/manifest.ts:199` | manifest에 configSchema를 강제한다. |
| `OC-PLUGIN-004` | plugins | `src/plugins/plugin-api.types.ts:168` | 플러그인 API가 많은 확장 표면을 통합한다. |
| `OC-SANDBOX-001` | sandbox | `src/agents/sandbox/backend-handle.types.ts:59` | sandbox backend handle 계약이 별도 타입이다. |
| `OC-SANDBOX-002` | sandbox | `src/agents/sandbox/backend.types.ts:46` | sandbox backend factory 등록 계약이 있다. |
| `OC-SANDBOX-003` | sandbox | `src/agents/sandbox/workspace-authority.ts:138` | workspace confinement를 정책·backend·tool surface까지 검증한다. |
| `OC-CHANNEL-001` | channels | `src/channels/message/ingress-queue.ts:573` | 채널 ingress를 durable queue에 저장한다. |
| `OC-CHANNEL-002` | channels | `src/channels/message/ingress-queue.ts:757` | claim token과 lane 차단으로 동시 처리를 제어한다. |
| `OC-CHANNEL-003` | channels | `extensions/mattermost/src/mattermost/monitor.ts:63` | Mattermost monitor가 독립 provider lifecycle로 구현된다. |
| `OC-UI-001` | ui | `ui/src/api/gateway.ts:306` | Control UI가 독립 Gateway browser client를 사용한다. |
| `OC-UI-002` | ui | `ui/src/app-routes.ts:23` | 승인 화면이 독립 route이다. |
| `OC-UI-003` | ui | `ui/src/app-routes.ts:26` | 대화 화면이 route module로 분리된다. |
| `OC-UI-004` | ui | `ui/package.json:38` | 현재 Control UI package가 Lit runtime을 사용한다. |
| `OC-OPS-001` | operations | `src/daemon/schtasks.ts:8` | Windows Scheduled Tasks backend가 있다. |
| `OC-OPS-002` | operations | `src/commands/doctor.ts:47` | doctor가 독립 명령으로 구현된다. |
| `OC-OPS-003` | operations | `src/cli/update-cli/update-command.ts:98` | update가 독립 명령·복구 흐름을 갖는다. |
| `OC-TEST-001` | tests | `src/gateway/server-import-boundary.test.ts:91` | Gateway facade/import boundary를 테스트한다. |
| `OC-TEST-002` | tests | `test/scripts/sqlite-session-schema-baseline.test.ts:18` | SQLite session schema baseline을 테스트한다. |
| `OC-TEST-003` | tests | `src/gateway/server/ws-connection.startup.test.ts:26` | 동시 connect race를 회귀 테스트한다. |
| `OC-CONFIG-007` | config | `src/config/io.write-safety.ts:12` | optimistic config write가 base snapshot의 현재성을 다시 확인한다. |
| `OC-CONFIG-008` | config | `src/config/io.write.ts:419` | config commit이 전용 atomic file replacement 경계를 사용한다. |
| `OC-CONFIG-009` | config | `src/config/io.observe-recovery.ts:228` | last-known-good config artifact의 경로가 source config와 별도로 관리된다. |
| `OC-CONFIG-010` | config | `src/secrets/ref-contract.ts:131` | SecretRef는 shared grammar와 complete reference validation을 갖는다. |
| `OC-CONFIG-011` | config | `src/config/redact-snapshot.ts:411` | config snapshot redaction이 별도 공개 함수로 분리되어 있다. |
| `OC-CONFIG-012` | config | `src/config/backup-rotation.ts:151` | config backup rotation과 permission hardening이 별도 유지보수 경계로 캡슐화된다. |
| `OC-PROTO-008` | protocol | `src/gateway/server/ws-connection/message-handler.ts:190` | 인증 전 WebSocket payload에 별도 상한을 적용한다. |
| `OC-PROTO-009` | protocol | `src/gateway/server/ws-connection/message-handler.ts:289` | 첫 WebSocket 요청은 connect handshake로 제한된다. |
| `OC-PROTO-010` | protocol | `src/gateway/server/ws-connection/message-handler.ts:394` | 인증 완료 후 요청 dispatch가 handshake와 분리된다. |
| `OC-PROTO-011` | protocol | `src/gateway/server/ws-connection.ts:363` | 인증 전 handshake timeout이 별도 timer로 관리된다. |
| `OC-PROTO-012` | protocol | `src/gateway/server/ws-connection.ts:407` | WebSocket outbound buffer 초과를 감지해 느린 연결을 종료한다. |
| `OC-STATE-007` | state | `src/infra/node-sqlite.ts:88` | Node 내장 SQLite open을 런타임·filesystem location 경계로 캡슐화한다. |
| `OC-STATE-008` | state | `src/infra/sqlite-wal.ts:60` | SQLite busy timeout을 유한한 정수로 정규화하고 PRAGMA에 적용한다. |
| `OC-STATE-009` | state | `src/infra/sqlite-transaction.ts:42` | SQLite write transaction callback의 Promise 반환을 명시적으로 거부한다. |
| `OC-STATE-010` | state | `src/infra/sqlite-integrity.ts:176` | SQLite quick/integrity check를 PRAGMA 결과 기반으로 검증한다. |
| `OC-STATE-011` | state | `src/infra/sqlite-integrity.ts:201` | foreign_key_check를 직접 실행해 참조 무결성 위반을 열거한다. |
| `OC-STATE-012` | state | `src/state/openclaw-state-db-maintenance.ts:92` | 지원 버전보다 새로운 SQLite schema를 명시적으로 거부한다. |
| `OC-STATE-013` | state | `src/config/sessions/session-accessor.sqlite-transcript-store.ts:45` | transcript event append를 하나의 SQLite transaction-owned 함수로 캡슐화한다. |
| `OC-STATE-014` | state | `src/config/sessions/session-accessor.sqlite-transcript-store.ts:65` | event identity와 message idempotency를 append 전에 확인해 중복을 제거한다. |
| `OC-STATE-015` | state | `src/config/sessions/session-accessor.sqlite-transcript-store.ts:79` | transcript sequence를 저장 직전에 단조 증가 값으로 할당한다. |
| `OC-STATE-016` | state | `src/config/sessions/session-transcript-projection-rebuild.ts:226` | projection rebuild는 authoritative transcript event를 sequence 순으로 다시 읽는다. |

| `OC-AGENT-006` | agent | `src/agents/embedded-agent-runner/run-entry.ts:192` | embedded Agent 실행 진입점이 별도 함수로 분리되어 있다. |
| `OC-AGENT-007` | agent | `src/agents/embedded-agent-runner/run-loop.ts:58` | 준비된 embedded Agent loop가 독립 실행 경계다. |
| `OC-AGENT-008` | agent | `packages/agent-core/src/agent-loop.ts:108` | 모델과 tool 반복을 소유하는 agentLoop가 core package에 있다. |
| `OC-AGENT-009` | agent | `packages/agent-core/src/agent-loop.ts:649` | tool call은 명시적인 sequential 실행 함수에서 처리된다. |
| `OC-MODEL-001` | model | `packages/ai/src/stream.ts:14` | provider registry를 주입받는 격리된 LLM runtime을 생성한다. |
| `OC-MODEL-002` | model | `packages/ai/src/providers/openai-responses.ts:82` | OpenAI Responses streaming adapter가 provider 함수로 분리되어 있다. |
| `OC-MODEL-003` | model | `packages/ai/src/transports/openai-responses-stream-internal.ts:295` | Responses transport event loop가 provider stream을 직접 해석한다. |
| `OC-MODEL-004` | model | `packages/ai/src/transports/openai-responses-stream-internal.ts:466` | function call arguments delta를 stream event에서 누적한다. |
| `OC-MODEL-005` | model | `packages/ai/src/transports/openai-responses-stream-internal.ts:684` | completed와 incomplete terminal event를 명시적으로 구분한다. |
| `OC-FILE-001` | file-tools | `src/agents/agent-tools.ts:660` | apply_patch는 기본적으로 workspace 내부로 제한된다. |
| `OC-FILE-002` | file-tools | `src/agents/agent-tools.ts:689` | read Tool은 workspace-only 정책일 때 명시적인 root guard로 감싼다. |
| `OC-FILE-003` | file-tools | `src/agents/sessions/tools/file-mutation-queue.ts:24` | 동일 실파일에 대한 mutation을 전용 queue로 직렬화한다. |
| `OC-FILE-004` | file-tools | `src/agents/sessions/tools/read.ts:38` | read Tool은 기본 byte와 line 상한을 별도 truncation 계약에서 가져온다. |
| `OC-FILE-005` | file-tools | `src/agents/sessions/tools/edit.ts:49` | edit Tool의 replacement는 exact original text와 non-overlap을 요구한다. |
| `OC-APPROVAL-005` | approval | `src/gateway/exec-approval-manager.ts:833` | 승인 만료 timer scheduling은 manager 내부 책임이다. |
