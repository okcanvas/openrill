# STEP018 — DOCTOR_BACKUP_AND_UPDATE

## 목적

진단, consistent backup/restore, update foundation을 구현한다.

## Reference Evidence

- `[OC-OPS-002] src/commands/doctor.ts:47` — doctor가 독립 명령으로 구현된다.
- `[OC-OPS-003] src/cli/update-cli/update-command.ts:98` — update가 독립 명령·복구 흐름을 갖는다.

## 구현 범위

- `packages/diagnostics`
- `apps/agent-cli doctor/backup/update`

## 선행조건

- Host, DB, Config, Workspace, Browser, Automation, Connector의 health interface가 존재한다.

## 구현 상세

1. read-only doctor check catalog와 severity/action을 정의한다.
2. repair는 plan→사용자 확인→apply→post-check로 분리한다.
3. support bundle에 redacted config, versions, health, recent logs를 포함한다.
4. SQLite backup API와 artifact/config/user Skill 복사를 일관된 manifest로 묶는다.
5. restore는 새 profile에 먼저 복원·검증하고 in-place overwrite를 기본 금지한다.
6. update는 download/stage/verify/switch/restart/rollback 상태 머신으로 설계한다.

## 공개 계약과 불변조건

- DoctorFinding: id, severity, evidence, suggestedAction, repairable.
- BackupManifest: version, profile, files, sha256, createdAt, schemaVersion.
- UpdateManifest는 signed/hash-verified artifact와 compatible schema range를 가진다.

## 상태·영속성 영향

- diagnostic runs, backup records, update attempts를 기록한다.

## 실패·복구 의미

- doctor는 기본적으로 state를 변경하지 않는다.
- backup 중 DB checkpoint/backup API 실패 시 불완전 archive를 성공으로 표시하지 않는다.
- restore hash/schema 검증 실패 시 target profile을 READY로 만들지 않는다.
- update 실패는 이전 executable/config/DB를 유지하거나 rollback한다.

## Acceptance

- healthy doctor
- multiple findings
- read-only invariant
- repair confirmation
- support redaction
- backup hashes
- backup during WAL
- restore fresh profile
- corrupt archive reject
- update stage verify
- failed switch rollback
- post-update health

기존 요약 gate:

- read-only doctor
- repair confirmation
- backup hash
- restore fresh profile
- failed update recovery

## 산출물

- diagnostics/backup/update packages
- CLI commands
- support bundle schema
- STEP018 acceptance

## 패키징 조건

- 이전 STEP 회귀 gate 통과
- source manifest와 생성 ZIP SHA-256 기록
- `HANDOFF.md`, `PLANS.md`, `VALIDATION.md` 갱신
- protected user payload, API key, Secret, runtime DB가 패키지에 포함되지 않음
- Windows live가 필요한 단계는 실제 Windows 로그 없이는 live accepted로 선언하지 않음

## 제외

- auto-update default

## 완료 선언

모든 Acceptance와 regression이 통과한 뒤에만 `STEP018_..._PASS`를 선언한다. 정적 분석이나 mocked smoke만으로 live acceptance를 선언하지 않는다.
