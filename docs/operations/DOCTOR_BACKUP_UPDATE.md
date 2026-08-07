# Doctor, Backup and Update

OpenClaw는 doctor와 update를 독립 명령으로 둔다: `[OC-OPS-002] src/commands/doctor.ts:47`, `[OC-OPS-003] src/cli/update-cli/update-command.ts:98`.

## doctor

- runtime version
- config parse/validation/LKG
- port/lock/process
- DB integrity/migration/checkpoint/bloat
- workspace roots/path permissions
- provider credentials presence
- browser executable
- Docker backend
- pending/expired approvals
- overdue automations
- connector probe

Doctor의 기본 모드는 읽기 전용이다. `--repair`는 실행 계획과 사용자 확인을 요구한다.

## backup

config source, SQLite consistent backup, skill/user data, artifact metadata를 manifest+hash와 함께 묶는다. raw Secret은 기본 제외한다.

## update

MVP 이후 구현한다. core package 교체 전 backup, stop, install, fresh doctor, restart, health check, rollback 가능성을 요구한다.
