# STEP013AR1_WORKSPACE_LOCK_IMPORTER_ALIGNMENT

## 목적
STEP013A Windows acceptance에서 확인된 `pnpm-lock.yaml` mutation을 dependency graph 불일치로 확정하고, 현재 BrowserRuntime 기능을 변경하지 않은 채 package/lock 정합성과 실행 전 불변성을 복구한다.

## 기준선
- current feature: `STEP013A_BROWSER_RUNTIME_LIFECYCLE_AND_POLICY_FOUNDATION`
- corrective release: `STEP013AR1_WORKSPACE_LOCK_IMPORTER_ALIGNMENT`
- version: `0.13.1-step013ar1`
- schema: 9
- official accepted baseline: STEP012DR4 Windows 180/180

## 코드 확인
`services/agent-host/package.json`에는 `@openrill/browser-runtime`이 있었지만 packaged Host lock importer에는 없었다. pnpm 11의 script 전 dependency verification이 implicit install로 lockfile을 수정했다.

## 구현 범위
- Host lock importer BrowserRuntime linkage
- all-workspace manifest/importer exact verifier
- missing-dependency negative fixture
- `verifyDepsBeforeRun: error`
- OR-ISSUE-083 documentation and gates

## 공개 계약
BrowserRuntime API, configuration, schema, Host lifecycle, and STEP013A scope remain unchanged.

## 상태 전이
No runtime state transition changes. Only package dependency state changes from stale/repairable to exact/immutable.

## 실패 및 복구
Importer mismatch fails before product validation with importer path and missing/extra dependency names. Stale `node_modules` fails at pnpm run without implicit install; the operator explicitly runs frozen install first.

## Acceptance
- lock alignment verifier PASS
- focused lock tests 3/3
- retained BrowserRuntime 13/13
- retained boundary 8/8
- historical Host fixtures 14/14
- canonical serial suite and skipped-zero
- initial/final package manifest unchanged
- deterministic source/repeat/fresh ZIP

## 반복 방지 기록
OR-ISSUE-083 detail, Registry row, and recurrence gates are mandatory.

## 패키징 산출물
`openrill-step013ar1-workspace-lock-importer-alignment-v1.zip`

## 제외
No Browser Tool, concrete adapter, migration, persistent profile, Artifact surface, or Browser UI is added.

## 완료 선언
Windows final marker is required before acceptance. Until then STEP012DR4 remains the official accepted baseline.
