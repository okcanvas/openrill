# CLI and Process

관찰: runtime guard, respawn/signal forwarding, lazy gateway fast path와 plugin CLI 등록이 분리된다: `[OC-CLI-001] openclaw.mjs:11`~`[OC-CLI-005] src/cli/run-main.ts:1530`.

채택: OpenRill wrapper도 runtime guard와 signal forwarding을 소유한다.

변경: CLI command명, profile env, respawn protocol은 독립 설계한다. 초기 command는 `start/status/stop/ui/doctor`.
