# OpenRill State Database Contract

## Authority

각 OpenRill profile은 `<dataRoot>/state/agent.db` 하나를 authoritative local state로 갖는다. Config source와 snapshots는 이 DB에 저장하지 않는다. Secret value도 저장하지 않는다.

## Ownership

`state_identity`의 단일 row가 product, profile, schema version을 고정한다. DB 파일을 다른 profile로 복사해 자동 채택하지 않는다.

## Schema and migrations

- 현재 schema version: `2`
- migration은 `packages/state/migrations/NNN_name.sql`
- version은 연속적이며 applied checksum은 immutable하다.
- `schema_migrations`와 `PRAGMA user_version`은 동일 version을 가리킨다.
- newer DB와 checksum drift는 fail closed다.

## Repository boundary

Application과 UI는 `OpenRillStateDatabase`와 domain repository만 사용한다. Raw `DatabaseSync`, SQL string, statement는 package 밖으로 반환하지 않는다. STEP005 repository는 ownership/health fixture만 제공하며 실제 business domain repository는 해당 STEP이 소유한다.

## Transactions

Write transaction은 `BEGIN IMMEDIATE`이고 callback은 synchronous다. callback throw, Promise/thenable 반환, commit failure는 rollback된다. busy timeout 초과는 `STATE_BUSY`다.

## Diagnostics

`diagnostics({full})`은 다음을 반환한다.

- quick check
- optional full integrity check
- foreign key violations
- schema version
- journal mode
- synchronous level
- FK enabled 여부
- busy timeout
- applied migration list

SQLite-native row object는 public API에서 plain object로 변환한다.

## Backup

Backup은 online SQLite backup API를 사용한다. 완료된 copy를 read-only로 다시 열어 full integrity와 foreign-key check를 통과한 뒤에만 verified result를 반환한다.
