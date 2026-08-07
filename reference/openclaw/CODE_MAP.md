# Code Map

## CLI / Host
- wrapper/runtime/respawn: `[OC-CLI-001] openclaw.mjs:11`, `[OC-CLI-002] openclaw.mjs:141`
- TS entry/lazy CLI: `[OC-CLI-003] src/entry.ts:35`~`[OC-CLI-005] src/cli/run-main.ts:1530`
- Gateway lifecycle: `[OC-GW-001] src/cli/gateway-cli/run-loop.ts:118`~`[OC-GW-009] src/gateway/server-runtime-state.ts:334`

## Protocol
- version and frame schemas: `[OC-PROTO-001] packages/gateway-protocol/src/version.ts:2`~`[OC-PROTO-007] packages/gateway-protocol/src/frame-guards.ts:37`

## Agent path
- inbound/dispatch: `[OC-MSG-001] src/auto-reply/dispatch.ts:442`~`[OC-MSG-003] src/auto-reply/reply/dispatch-from-config.ts:22`
- runner/core loop: `[OC-AGENT-001] src/auto-reply/reply/agent-runner-run.ts:70`~`[OC-AGENT-005] packages/agent-core/src/agent-loop.ts:668`

## Persistence
- agent/session DB: `[OC-STATE-001] src/state/openclaw-agent-schema.sql:34`~`[OC-STATE-004] src/state/openclaw-agent-schema.sql:379`
- automation state: `[OC-STATE-005] src/state/openclaw-state-schema.sql:1295`, `[OC-STATE-006] src/state/openclaw-state-schema.sql:1365`

## Safety and extensibility
- config: `[OC-CONFIG-001] src/config/io.factory.ts:21`~`[OC-CONFIG-006] src/config/future-version-guard.ts:1`
- approval: `[OC-APPROVAL-001] src/infra/exec-approvals-core.ts:9`~`[OC-APPROVAL-004] src/gateway/exec-approval-manager.ts:221`
- skills: `[OC-SKILL-001] src/skills/loading/skill-contract.ts:4`~`[OC-SKILL-004] src/skills/loading/workspace.ts:1751`
- plugins: `[OC-PLUGIN-001] src/plugins/discovery.ts:1402`~`[OC-PLUGIN-004] src/plugins/plugin-api.types.ts:168`
- sandbox: `[OC-SANDBOX-001] src/agents/sandbox/backend-handle.types.ts:59`~`[OC-SANDBOX-003] src/agents/sandbox/workspace-authority.ts:138`
- channels: `[OC-CHANNEL-001] src/channels/message/ingress-queue.ts:573`~`[OC-CHANNEL-003] extensions/mattermost/src/mattermost/monitor.ts:63`
