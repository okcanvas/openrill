# SQLite Reliability Operations

## Startup gate

Host lock을 얻은 뒤 state DB를 먼저 open한다. migration 또는 integrity가 실패하면 listener를 열지 않고 lock을 해제한다. READY 상태는 DB가 current schema와 ownership을 증명한 뒤에만 가능하다.

## WAL policy

WAL은 normal operation의 필수 journal mode다. `synchronous=NORMAL`, `wal_autocheckpoint=1000`, `journal_size_limit=64 MiB`를 사용한다. 종료 시 `TRUNCATE` checkpoint를 시도하고 DB를 닫은 다음 profile lock을 해제한다.

## Contention

기본 busy timeout은 1500ms다. 무한 retry나 숨겨진 queue는 없다. 호출자는 `STATE_BUSY`를 받아 상위 정책에서 재시도 여부를 결정한다.

## Integrity policy

- 일반 startup: `quick_check` + `foreign_key_check`
- pending upgrade와 backup verification: `integrity_check` + `foreign_key_check`
- failure 시 source DB를 자동 수정하지 않는다.

## Backup policy

온라인 backup은 WAL의 committed state를 포함해야 한다. backup 파일은 source와 다른 경로이며 Unix에서는 mode `0600`으로 harden한다. 결과에는 path, page count, bytes, SHA-256, integrity result를 반환한다.

## Future doctor ownership

Repair, quarantine, backup rotation, vacuum, retention은 STEP018 doctor/maintenance가 소유한다. STEP005 startup path에 destructive repair를 넣지 않는다.
