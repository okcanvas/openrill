# Validation Evidence

현재 기준선에서 보존하는 검증 결과:

- OpenClaw source evidence `76/76` path·line·needle·excerpt 일치
- OpenRill STEP000A deterministic gate `165/165` 통과 기록
- OpenRill STEP001 deterministic regression gate `230/230` 통과
- OpenRill STEP001A null-importer lockfile gate `18/18` 통과
- workspace packages `24`, public exports `24/24`
- unit tests `6/6`
- package graph edges `54`, cycle `0`
- UI framework selection `DEFERRED`

`STEP001_ACCEPTANCE_REPORT.txt`는 현재 source tree에서 재실행 가능한 결과다. `STEP000A_ACCEPTANCE_REPORT.txt`는 이전 planning/identity 기준선의 역사적 증거로 보존한다.

Windows에서 Node/Corepack/pnpm 실행은 확인됐다. 기존 STEP001 lockfile 실패를 수정했으며 STEP001A ZIP에서 frozen pnpm install과 `pnpm acceptance:step001a` 로그가 필요하다.
