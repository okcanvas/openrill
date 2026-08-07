# OpenClaw SQLite State Reference Study

## 조사 범위

- `src/infra/node-sqlite.ts`
- `src/infra/sqlite-wal.ts`
- `src/infra/sqlite-transaction.ts`
- `src/infra/sqlite-integrity.ts`
- `src/state/openclaw-state-db-maintenance.ts`

## 확인한 문제와 해결

1. SQLite open을 runtime availability와 filesystem location normalization 뒤에 둔다.
2. schema를 만지기 전에 busy timeout을 설정해 concurrent first-open failure를 줄인다.
3. transaction callback에서 Promise를 허용하지 않는다.
4. quick/integrity check와 foreign_key_check를 별도 신뢰 gate로 사용한다.
5. binary가 지원하지 않는 newer schema를 거부한다.

## OpenRill 채택

- built-in `node:sqlite`
- target-platform path normalization
- bounded busy timeout
- WAL, FK, synchronous transaction
- quick/full/FK integrity
- newer schema refusal
- Host startup/shutdown composition

## OpenRill 비채택

- OpenClaw table/schema 이름
- Kysely wrapper
- 여러 DB 종류의 공통 maintenance framework
- quarantine/repair 자동화
- legacy schema compatibility
- OpenClaw migration metadata/API

OpenRill은 위 원리를 독립 `@openrill/state` API, `agent.db`, `schema_migrations`, error code, tests로 재작성한다.
