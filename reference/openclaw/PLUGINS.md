# Plugins

관찰: discovery, manifest/configSchema, 광범위 API가 존재한다: `[OC-PLUGIN-001] src/plugins/discovery.ts:1402`~`[OC-PLUGIN-004] src/plugins/plugin-api.types.ts:168`.

채택: path security, manifest validation, activation planning.

변경: OpenRill 초기 SDK는 Provider/Tool/SkillSource/Connector 네 종류로 제한하고 UI/RPC arbitrary registration은 금지한다.
