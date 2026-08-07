# STEP010 Skill Snapshot Capture Race

## Exact symptom

동일 Run과 Skill을 동시에 capture하거나 이전 실패가 deterministic destination directory를 남긴 경우, 두 번째 capture가 rename 충돌을 기존 directory 존재만으로 성공 처리할 수 있었다.

## Code-confirmed root cause

초기 `SkillSnapshotStore.capture`는 destination이 directory이면 temp를 삭제하고 계속했지만, 기존 directory의 파일 hash와 현재 metadata를 대조하지 않았다. capture 전체를 직렬화하는 key도 없었다.

## Impact

다른 bytes를 현재 DB metadata와 결합하거나 부분 directory를 immutable snapshot으로 오인할 수 있었다.

## Fix

`runId + skillId` keyed capture tail로 in-process capture를 직렬화한다. DB row가 없는 destination은 제거하고 새 temp를 atomic rename한다. load는 manifest, instructions, 모든 resource의 byte count와 SHA-256을 검증한다.

## Recurrence-prevention gate

동시 capture fixture가 한 snapshot ID/row만 생성함을 검사하고, 원본 삭제 후 snapshot load 및 모든 파일 hash 검증 source token을 acceptance가 확인한다.
