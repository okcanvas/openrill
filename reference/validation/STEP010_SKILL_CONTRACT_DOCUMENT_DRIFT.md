# STEP010 Skill Contract Document Drift

## Exact symptom

`docs/contracts/SKILLS.md` 예시는 `summary`, `entry`, `allowedTools`를 선언했지만 실제 strict parser는 `description`, `instructions`, `tools`만 허용했다.

## Code-confirmed root cause

STEP010 placeholder 문서가 구현 전 예시에서 갱신되지 않았고 parser key set과 문서를 비교하는 gate가 없었다.

## Impact

ZIP만 받은 다음 작업자가 문서대로 Skill을 만들면 `SKILL_MANIFEST_INVALID`로 격리된다.

## Fix

계약 문서를 실제 eight-field manifest와 compatibility nested keys에 맞추고 builtin example도 같은 문법을 사용한다.

## Recurrence-prevention gate

acceptance는 parser의 exact top-level keys, contract의 field names, builtin `skill.yaml` discovery/snapshot 성공을 함께 검사한다.
