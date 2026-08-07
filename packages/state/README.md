# @openrill/state

OpenRill profile별 authoritative SQLite 상태 경계이다.

- `node:sqlite`만 사용한다.
- migration 파일은 immutable checksum ledger로 검증한다.
- connection은 foreign keys, WAL, bounded busy timeout, synchronous NORMAL을 강제한다.
- raw `DatabaseSync`는 public API로 노출하지 않는다.
- domain table은 각 후속 STEP에서 명시적으로 추가한다.
