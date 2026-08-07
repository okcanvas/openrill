# STEP005 — SQLITE_STATE_AND_MIGRATION_FOUNDATION

## 목적

OpenRill profile마다 하나의 authoritative SQLite state database를 만들고, 이후 Conversation·Run·Approval·Artifact 도메인이 의존할 migration, transaction, integrity, checkpoint, backup 경계를 닫는다. STEP005는 business domain을 구현하지 않는다. Host가 READY가 되기 전에 DB ownership, schema, migration ledger, foreign-key integrity가 검증되어야 한다.

## 기준선

- Input: Windows-live-accepted `STEP004_LOCAL_PROTOCOL_AND_AUTHENTICATED_WEBSOCKET` (`0.4.0-step004`)
- Output: `STEP005_SQLITE_STATE_AND_MIGRATION_FOUNDATION` (`0.5.0-step005`)
- Runtime: Node.js built-in `node:sqlite`
- DB: profile별 `<dataRoot>/state/agent.db`
- Schema version: `2`

## Reference Evidence

- `[OC-STATE-007] src/infra/node-sqlite.ts:88` — Node 내장 SQLite open을 filesystem-location boundary로 캡슐화한다.
- `[OC-STATE-008] src/infra/sqlite-wal.ts:60` — busy timeout을 유한 정수로 적용한다.
- `[OC-STATE-009] src/infra/sqlite-transaction.ts:42` — synchronous transaction callback만 허용한다.
- `[OC-STATE-010] src/infra/sqlite-integrity.ts:176` — quick/integrity PRAGMA 결과를 검증한다.
- `[OC-STATE-011] src/infra/sqlite-integrity.ts:201` — foreign-key violation을 별도 검사한다.
- `[OC-STATE-012] src/state/openclaw-state-db-maintenance.ts:92` — 지원보다 새로운 schema를 거부한다.

OpenClaw 구현은 정답지로만 사용한다. OpenClaw table과 API를 복제하지 않으며, OpenRill table, path, API, error code, migration format은 독립 계약이다.

## OpenClaw 문제 분석

OpenClaw는 여러 SQLite DB와 장기간 누적된 schema·maintenance·quarantine 흐름을 갖는다. 이는 성숙한 운영 증거이지만 OpenRill 초기 단계에 그대로 가져오면 다음 복잡성이 먼저 생긴다.

- DB별 서로 다른 ownership와 schema bootstrap
- Kysely/raw SQLite 혼합 경계
- repair/quarantine/doctor 정책의 조기 일반화
- 다수 domain table을 한 단계에서 선점
- 호환 migration과 current migration의 동시 유지

OpenRill STEP005는 하나의 profile-scoped DB, 하나의 migration runner, 하나의 repository boundary만 허용한다. quarantine 자동복구나 domain schema는 후속 STEP에서 실제 요구가 생길 때 추가한다.

## 구현 범위

### 파일

- `packages/state/src/database.ts`
- `packages/state/src/migrations.ts`
- `packages/state/src/transaction.ts`
- `packages/state/src/integrity.ts`
- `packages/state/src/repository.ts`
- `packages/state/src/paths.ts`
- `packages/state/src/errors.ts`
- `packages/state/src/types.ts`
- `packages/state/migrations/001_state_identity.sql`
- `packages/state/migrations/002_state_health_checks.sql`
- `tests/unit/state-step005.test.mjs`
- `scripts/run-step005-live.mjs`

### profile state paths

```text
<dataRoot>/state/
├─ agent.db
├─ agent.db-wal       # runtime sidecar, package 제외
├─ agent.db-shm       # runtime sidecar, package 제외
└─ backups/
   └─ agent-<UTC timestamp>.db
```

`resolveStatePaths()`는 STEP002B와 동일하게 target platform의 `path.win32` 또는 `path.posix`를 사용한다. Host OS의 path semantics가 명시적 target platform 계산에 누출되어서는 안 된다.

## 공개 계약

### database handle

```ts
openOpenRillStateDatabase(options): Promise<OpenRillStateDatabase>
```

공개 handle은 다음만 노출한다.

- `paths`
- `schemaVersion`
- `appliedMigrations`
- `identity()`
- `recordHealthCheck()` / `readHealthCheck()`
- synchronous `transaction()`
- `diagnostics()`
- `checkpoint()`
- verified `backup()`
- idempotent `close()`

Raw `DatabaseSync`, prepared statement, transaction handle은 app/UI/protocol에 노출하지 않는다.

### connection policy

각 connection은 다음을 적용한다.

```sql
PRAGMA busy_timeout = 1500;
PRAGMA foreign_keys = ON;
PRAGMA trusted_schema = OFF;
PRAGMA synchronous = NORMAL;
PRAGMA wal_autocheckpoint = 1000;
PRAGMA journal_size_limit = 67108864;
PRAGMA journal_mode = WAL;
```

`busy_timeout`은 호출자가 `0..120000ms` 범위에서 변경할 수 있다. 무한 재시도는 없다.

### migration identity

Migration filename:

```text
NNN_lower_snake_case.sql
```

Ledger:

```sql
schema_migrations(
  version INTEGER PRIMARY KEY,
  name TEXT UNIQUE,
  checksum TEXT,
  applied_at INTEGER
)
```

불변조건:

- version은 1부터 연속적이다.
- filename name은 중복될 수 없다.
- checksum은 SQL UTF-8 bytes의 SHA-256이다.
- 이미 적용된 migration의 name/checksum 변경은 `STATE_MIGRATION_DRIFT`다.
- `PRAGMA user_version`과 ledger 최고 version은 항상 같아야 한다.
- DB version이 binary 지원 version보다 높으면 `STATE_SCHEMA_NEWER`다.
- 각 migration은 `BEGIN IMMEDIATE` transaction 하나로 적용된다.

### ownership

`state_identity` row `id=1`은 다음을 고정한다.

```text
product = OpenRill
profile = canonical profile
schema_version = current migration version
```

다른 profile DB를 열면 `STATE_OWNERSHIP_MISMATCH`다. Public read 결과는 SQLite의 null-prototype row를 그대로 반환하지 않고 plain object로 정규화한다.

### transaction

`transaction(callback)`은 synchronous callback만 허용한다. Promise 또는 thenable 반환은 rollback 후 `STATE_TRANSACTION_ASYNC`다. lock contention이 configured timeout을 넘으면 `STATE_BUSY`다.

### integrity

Startup trust order:

```text
open file
→ connection PRAGMA
→ existing DB quick/full + foreign_key_check
→ migration ledger/version/drift
→ migrations
→ final quick_check + foreign_key_check
→ ownership/schema verify
→ Host listener
```

현재 schema DB도 ownership보다 integrity를 먼저 검사한다. 손상된 FK가 ownership mismatch로 오분류되어서는 안 된다.

### backup

Backup은 SQLite online backup API를 사용하고 source와 다른 destination만 허용한다.

```text
PASSIVE checkpoint
→ online backup
→ destination permission hardening
→ read-only reopen
→ full integrity_check + foreign_key_check
→ bytes + SHA-256 반환
```

WAL에 commit된 최신 row가 backup에 포함되어야 한다.

## 상태 전이

```text
CLOSED
  → OPENING
  → CONFIGURED
  → VERIFYING_EXISTING
  → MIGRATING
  → VERIFYING_FINAL
  → OPEN
  → CHECKPOINTING
  → CLOSED

어느 startup 단계 실패 → close connection → FAILED
```

Host startup:

```text
profile lock
→ state open/migrate/integrity
→ HTTP/WebSocket listener
→ READY
```

Host shutdown:

```text
protocol peers close
→ HTTP listener close
→ WAL TRUNCATE checkpoint + state close
→ metadata delete
→ profile lock release
```

## 실패 및 복구

| Error | 의미 | 자동 처리 |
|---|---|---|
| `STATE_SQLITE_UNAVAILABLE` | DB open 실패 | startup 중단 |
| `STATE_MIGRATION_SET_INVALID` | packaged migration 집합 오류 | startup 중단 |
| `STATE_MIGRATION_DRIFT` | 적용 migration 변경 | startup 중단 |
| `STATE_SCHEMA_NEWER` | DB가 binary보다 새 버전 | startup 중단 |
| `STATE_SCHEMA_INCONSISTENT` | ledger/user_version/identity 불일치 | startup 중단 |
| `STATE_OWNERSHIP_MISMATCH` | 다른 product/profile DB | startup 중단 |
| `STATE_INTEGRITY_FAILED` | quick/integrity/FK 실패 | startup 중단 |
| `STATE_BUSY` | bounded wait 이후 lock contention | 호출 실패, 무한 retry 없음 |
| `STATE_TRANSACTION_ASYNC` | async transaction callback | rollback |
| `STATE_BACKUP_FAILED` | backup/copy verify 실패 | source 유지, 실패 반환 |

STEP005는 자동 repair, quarantine rename, destructive rebuild를 수행하지 않는다. 운영 repair는 STEP018 doctor에서 소유한다.

## Acceptance

### deterministic

- fresh DB migration `1→2`
- second open migration no-op와 ledger timestamp 보존
- 동일 runner의 sequential upgrade fixture
- checksum drift 거부
- newer schema 거부
- profile ownership 고정
- foreign key enforcement
- current-schema FK corruption startup 거부
- WAL, synchronous, busy timeout, trusted schema 정책
- synchronous transaction commit/rollback
- Promise callback rollback
- concurrent writer bounded failure
- online backup에 WAL commit 포함
- full backup integrity
- Host READY 전 DB schema 준비
- Host shutdown 후 reopen
- target-platform state path semantics
- raw DB handle public export 금지

### Windows live

```cmd
pnpm install --frozen-lockfile
pnpm acceptance:step005
```

기대 marker:

```text
STEP005_SQLITE_STATE_AND_MIGRATION_FOUNDATION checks=<all>/<all> state=PASSED schema=2 journal=WAL migrations=CHECKSUMMED backup=VERIFIED
```

## 패키징 산출물

- source ZIP
- SHA-256 sidecar
- `PACKAGE_MANIFEST.json`
- `reference/validation/STEP005_ACCEPTANCE_REPORT.txt`
- OpenClaw evidence verification `100/100`
- fresh-ZIP acceptance와 post-rerun manifest 검증

## 제외

- Conversation/Session/Event tables
- Run/Tool/Approval/Artifact tables
- public state protocol operations
- database encryption
- remote database
- automatic repair/quarantine
- retention/vacuum scheduler
- SQLite extension loading
- raw SQL plugin surface

## 완료 선언

Deterministic acceptance, previous STEP regression, actual separate-process Host/DB/backup live fixture, source manifest, fresh-ZIP rerun이 모두 통과해야 packaged deterministic baseline으로 선언한다. 사용자 Windows 로그 전에는 Windows live accepted로 선언하지 않는다.
