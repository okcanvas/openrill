# @openrill/config

OpenRill이 독립 소유하는 profile path, YAML source config, closed validation, include resolution, materialized snapshot, last-known-good recovery, atomic mutation journal, SecretRef 경계다.

## Source and state

- `<configRoot>/agent.yaml`: 사용자가 편집하는 source
- `<dataRoot>/config/materialized.json`: 현재 검증된 materialized snapshot
- `<dataRoot>/config/last-known-good.json`: 복구 가능한 마지막 정상 snapshot
- `<dataRoot>/config/journal/*.json`: 값 없는 mutation metadata
- `<configRoot>/secrets/`: file SecretRef root

Secret 값은 source snapshot, LKG, journal, CLI config output에 기록하지 않는다.
