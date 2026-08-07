# Tests and Gates

관찰: import boundary, schema baseline, handshake race가 명시적 회귀 테스트다: `[OC-TEST-001] src/gateway/server-import-boundary.test.ts:91`~`[OC-TEST-003] src/gateway/server/ws-connection.startup.test.ts:26`.

채택: architecture boundary, DB baseline, concurrency/failure tests, platform live gates.

변경: OpenRill acceptance는 자체 계약과 exact check count를 검증한다.
