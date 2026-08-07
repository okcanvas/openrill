# STEP012BR1 Historical Acceptance Baseline Ownership

## 목적

STEP012B Windows 실행에서 제품·Chromium 검증이 모두 성공한 뒤 historical STEP011 root-document checks가 현재 문서를 거부한 validation defect를 제거한다.

## 기준선

- current feature candidate: `STEP012B_AUTOMATION_SCHEDULER_LIFECYCLE_LEASE_AND_RECOVERY`
- revision: `STEP012BR1_HISTORICAL_ACCEPTANCE_BASELINE_OWNERSHIP`
- version: `0.12.3-step012br1`
- schema: 8
- official accepted baseline: STEP012AR1 Windows `163/163`
- accepted ZIP SHA-256: `1f038edc3c21bf9ddff233fc079df80dd18289231d30045c84595e8ec0c6e257`

## Windows 실패 증거

Nested STEP011 completed Vue acquisition, build/unit/architecture/exports, actual Chromium, and STEP010 live regression, but failed exactly ten `baseline-step`/`baseline-next` checks across five mutable root documents and ended `218/228`.

## 코드 확인

`run_step011_acceptance.py` contained historical literals for the STEP011 current step and broad STEP012 next plan. Current STEP012B root documents correctly contain the current candidate and STEP012C next cut. Current STEP012B acceptance already owns those contracts.

## 구현 범위

- historical STEP011 root-document ownership delegation;
- current release identity-derived checks;
- retained STEP011R8 history and current-claim-zero checks;
- OR-ISSUE-061 detail/registry/gate;
- focused 4/4 ownership regression;
- current STEP012B feature and scheduler code unchanged.

## 공개 계약

No product API, schema, protocol, scheduler, executor, or UI contract changes.

## 상태 전이

No runtime state transition changes. This revision changes validation ownership only.

## Catch-up 계약

STEP012B의 `SKIP`, `RUN_ONCE`, `BOUNDED` 계약은 변경하지 않으며 focused scheduler regression으로 그대로 검증한다.

## 실패 및 복구

A historical runner may fail current root documents only for incoherent current release identity or a false claim that STEP011 is current. It may not require historical next-cut wording.

## Acceptance

- focused historical ownership 4/4;
- STEP012A focused 14/14;
- STEP012B scheduler focused 10/10;
- canonical serial suite with zero fail/skip;
- historical STEP012B full regression, including nested STEP012AR1 and STEP011 actual Chromium on Windows;
- package manifest pre/post unchanged;
- fresh-ZIP deterministic reproduction.

## 반복 방지 기록

OR-ISSUE-061, detailed Windows evidence, and the historical ownership recurrence gate are mandatory.

## 패키징 산출물

Deterministic source ZIP, SHA-256 sidecar, package manifest, canonical local acceptance report, README/HANDOFF continuation state.

## 제외

Protocol/Conversation Run integration remains STEP012C and Control UI/actual-browser feature work remains STEP012D. failure backoff/auto-disable and disable-active cancellation also remain deferred. No scheduler behavior changes are included.

## 완료 선언

Only a Windows final marker with nested STEP012B/STEP012AR1/STEP011 passes promotes this revision.
