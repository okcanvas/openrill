# ADR-0020 — Profile-scoped SQLite and immutable migration ledger

## Status

Accepted for STEP005.

## Context

OpenRill은 local-first 제품이므로 서버 DB를 필수로 둘 수 없다. 이후 domain state는 crash/restart 후 복구되어야 하고 migration drift와 newer binary downgrade를 탐지해야 한다. OpenClaw는 node:sqlite, WAL, bounded busy wait, integrity check, newer schema refusal을 실제 운영 경계로 갖는다.

## Decision

- profile당 `agent.db` 하나를 사용한다.
- Node built-in `node:sqlite`를 사용하고 native addon dependency를 추가하지 않는다.
- migration SQL과 SHA-256 ledger를 authoritative schema history로 사용한다.
- `PRAGMA user_version`을 ledger version과 교차 검증한다.
- WAL/foreign key/bounded busy timeout을 강제한다.
- transaction callback은 synchronous다.
- startup integrity를 migration과 ownership보다 먼저 신뢰 gate로 둔다.
- backup은 online API 후 read-only full verification한다.

## Consequences

장점:

- 설치가 단순하고 profile 이동 경계가 명확하다.
- migration drift와 downgrade 위험을 조기에 차단한다.
- Host READY와 state readiness가 동일해진다.
- domain repository를 후속 STEP별로 추가할 수 있다.

비용:

- Node runtime의 SQLite API 안정성 범위를 지원 정책에 포함해야 한다.
- raw SQL extension과 비동기 transaction callback을 허용하지 않는다.
- repair/retention/backup rotation은 별도 단계가 필요하다.

## Rejected alternatives

- JSON file state: transaction/FK/migration/large event ledger에 부적합.
- server PostgreSQL 필수: OpenRill local-independent 경계 위반.
- better-sqlite3/sqlite3 addon: 별도 native binary 공급망과 설치 부담.
- domain table 선구현: owning service 없이 schema surface만 증가.
