# STEP010 Skill Source Revision Integrity

## Exact symptom

동일 source root의 `skill.yaml` description을 변경한 뒤 재탐색해도 `skill_sources.root_revision`이 변경되지 않았다.

## Code-confirmed root cause

초기 구현은 `rootRevision = sha256(source.rootPath)`를 저장했다. 경로 identity만 포함하므로 manifest와 diagnostic 내용이 바뀌어도 digest는 동일했다.

## Impact

운영 진단과 Run catalog 근거가 stale source를 새 source와 구분하지 못하고 변경 감지 증거로 사용할 수 없었다.

## Fix

각 source의 canonical catalog entry(`skillId`, version, manifest SHA, manifest path)와 validation diagnostic을 정렬해 SHA-256한다. discovery-to-capture 사이 manifest 변경도 catalog의 `manifestSha256`과 다시 비교한다.

## Recurrence-prevention gate

unit fixture가 manifest metadata 변경 전후 source revision이 달라짐을 검사하며 acceptance는 path-only hash 표현이 없고 `manifestSha256` gate가 존재함을 확인한다.
