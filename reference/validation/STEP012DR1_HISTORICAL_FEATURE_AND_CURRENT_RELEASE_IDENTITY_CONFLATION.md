# STEP012DR1 historical feature and current release identity conflation

## 이슈

```text
OR-ISSUE-073
STEP012DR1_HISTORICAL_FEATURE_AND_CURRENT_RELEASE_IDENTITY_CONFLATION
```

## 실제 증상

STEP012DR1 local acceptance에서 focused tests는 통과했지만 canonical suite가 218개 중 1개 실패했다.

```text
not ok - current root documents are owned by STEP012D while historical accepted evidence remains dedicated
error: PLANS.md
actual current cut: STEP012DR1_HOST_READY_AND_UI_BOOTSTRAP_PHASE_ALIGNMENT
```

## 코드로 확정한 원인

`historical-acceptance-baseline-scope-step012br1.test.mjs`는 root 문서마다 `STEP012D_AUTOMATION_CONTROL_UI_WINDOWS_VERTICAL_SLICE`를 요구했다. STEP012D는 retained feature identity이지만 STEP012DR1은 현재 release identity이다. 테스트가 두 소유권을 하나로 합쳐 corrective revision을 stale/invalid로 판정했다.

같은 시점에 active historical Python runner의 `RELEASE_STEP/VERSION`도 STEP012D candidate literal을 유지해, R1에서 직접 nested 실행할 경우 current package manifest identity와 충돌할 수 있었다.

## 영향

- 기능 변경 없이 corrective revision을 만들 때 canonical suite가 허위 실패한다.
- root 문서가 현재 release를 정확히 기록할수록 historical test가 실패한다.
- 다음 R2/R3에서도 매번 테스트 literal을 바꾸는 악순환이 생긴다.

## 수정

- current release identity는 `PACKAGE_MANIFEST.json`의 `step/version`에서 읽는다.
- root 문서는 current release identity와 retained STEP012D feature identity를 각각 검증한다.
- accepted STEP012CR1 marker/history는 계속 dedicated evidence로 검증한다.
- active historical Python runners의 package release identity를 STEP012DR1로 정렬한다.

## 수정 전 재현

Root `PLANS.md`를 올바른 R1 current cut으로 바꾸면 기존 exact STEP012D current-owner assertion이 실패했다. 수정 후 동일 문서는 current manifest step과 STEP012D feature를 모두 포함해야 통과한다.

## 자동 반복 방지 gate

- historical root ownership test는 `JSON.parse(await source("PACKAGE_MANIFEST.json"))`를 사용한다.
- current manifest step과 retained feature step을 별도 assertion으로 검사한다.
- R1 acceptance는 OR-ISSUE-073 detail/Registry/recurrence 항목과 dynamic source pattern을 강제한다.
- future corrective revision은 historical test의 release literal 수정 없이 current manifest identity로 통과해야 한다.
