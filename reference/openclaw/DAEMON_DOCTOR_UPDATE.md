# Daemon, Doctor and Update

관찰: Windows Scheduled Tasks, doctor, update가 독립 subsystem이다: `[OC-OPS-001] src/daemon/schtasks.ts:8`~`[OC-OPS-003] src/cli/update-cli/update-command.ts:98`.

채택: foreground-first, platform service adapter, read-only doctor, update health/rollback.

변경: STEP019 전 background daemon을 제품 전제로 두지 않는다.
