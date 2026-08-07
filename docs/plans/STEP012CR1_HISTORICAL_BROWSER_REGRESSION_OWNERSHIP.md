# STEP012CR1_HISTORICAL_BROWSER_REGRESSION_OWNERSHIP

## 목적

STEP012C Windows 실행에서 backend Protocol/Conversation 통합이 모두 통과했지만 historical STEP011 외부 Vue 재획득이 `runtime_unavailable`로 실패한 acceptance 소유권 결함을 제거한다.

## 기준선

- official accepted baseline: `STEP012BR1_HISTORICAL_ACCEPTANCE_BASELINE_OWNERSHIP` Windows `187/187`
- immutable accepted ZIP SHA-256: `b90721d4d24f7467355f1f2dcd7e94d65f03517a7f60ff8208fa0c915f6ccbde`
- retained feature: `STEP012C_AUTOMATION_PROTOCOL_AND_CONVERSATION_RUN_INTEGRATION`
- current version: `0.12.5-step012cr1`
- state schema: 9

## 코드 확인

STEP012C는 historical STEP012BR1 전체 chain을 unconditional 실행했고, 그 chain은 STEP011에서 exact Vue 3.5.40 tarball을 다시 network download했다. accepted STEP012BR1 대비 current browser app six files는 byte-identical이고, STEP011 live script delta는 schema literal을 State owner로 교체한 두 줄뿐이다. STEP011 fixture에는 Automation enablement가 없어 STEP012C production executor는 해당 browser flow에서 비활성이다.

## 구현 범위

- accepted browser surface SHA manifest
- schema-owner-normalized STEP011 live script hash gate
- historical browser no-impact verifier
- STEP012C delegated acceptance mode
- honest `ACCEPTED_BASELINE_NO_IMPACT` marker
- OR-ISSUE-066 registry/detail/recurrence gates
- current R1 acceptance/package/launchers/docs

## 공개 계약

Default direct `acceptance:step012c`는 진단용 actual Chromium path를 유지한다. `acceptance:step012cr1`은 immutable accepted Chromium evidence와 current no-impact hash gates를 사용한다. Browser surface가 변경되면 delegated mode는 fail-closed한다.

## 상태 전이

제품 Automation/Conversation 상태 전이는 STEP012C와 동일하다. 이번 revision은 제품 state 또는 schema를 변경하지 않는다.

## 실패 및 복구

- accepted SHA/marker mismatch → 실패
- six browser file hash mismatch → 실패
- normalized live script mismatch → 실패
- STEP011 live에 Automation reference 등장 → 실패
- current STEP012C focused/canonical regression 실패 → 실패
- delegated marker가 actual Chromium을 주장하면 실패

## Acceptance

- browser ownership focused 4/4
- STEP012A 14/14
- STEP012B 10/10
- STEP012C 5/5
- historical ownership/schema and vendor timeout regressions
- canonical serial suite zero failure/skip
- nested STEP012C delegated regression PASSED
- manifest pre/post unchanged
- deterministic source/fresh ZIP

## 반복 방지 기록

`OR-ISSUE-066`과 `STEP012C_WINDOWS_HISTORICAL_BROWSER_RUNTIME_OWNERSHIP.md`를 추가한다. UI 변경 단계가 아닌 release는 accepted browser evidence를 hash/no-impact gate로 위임한다. STEP012D는 actual Windows Chromium을 다시 소유한다.

## 패키징 산출물

- `openrill-step012cr1-historical-browser-regression-ownership-v1.zip`
- SHA-256 sidecar
- `STEP012CR1_ACCEPTANCE_REPORT.txt`
- browser baseline JSON
- README/HANDOFF/PLANS/ROADMAP/VALIDATION

## 제외

- Automation Control UI
- actual STEP012D browser vertical slice
- Vue archive vendoring 정책 변경
- failure backoff/auto-disable
- disable-active cancellation
- event-driven trigger

## 완료 선언

Current STEP012C product implementation과 browser-owned files가 accepted STEP012BR1 browser surface에 영향을 주지 않음을 코드/hash로 증명하고, external Vue 재획득을 current backend release PASS의 필수 조건에서 제거할 때 완료한다.
