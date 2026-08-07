# STEP012D_AUTOMATION_CONTROL_UI_WINDOWS_VERTICAL_SLICE

## 목적

Accepted STEP012CR1 Protocol/Conversation integration 위에 Automation 운영 UI를 추가하고, actual Vue 3.5.40 + Windows Chromium에서 create/edit/enable/disable/run-now/replay/history를 끝까지 검증한다.

## 기준선

- official accepted baseline: `STEP012CR1_HISTORICAL_BROWSER_REGRESSION_OWNERSHIP` Windows `101/101`
- immutable accepted ZIP SHA-256: `3f2a47484f6341be98c00f189c12e2df7ec0e14e308de382d6bafddc90117062`
- current version: `0.12.6-step012d`
- state schema: 9

## 코드 확인

STEP012C는 six closed Automation operations, durable manual request identity, production Conversation executor, pre-execution AgentRun linkage, and explicit job/run notices를 제공한다. 기존 Control UI는 Automation route/state/action/notice handler가 전혀 없었다. STEP012D는 새 backend operation을 추가하지 않고 그 공개 계약만 소비한다.

## 구현 범위

- `#/automations` route와 primary navigation
- list/select/new editor
- at/interval/cron 입력
- workspace/prompt/title/model profile
- catch-up/failure policy
- create/update, enable/disable
- run-now와 same-request replay
- run history, AgentRun identity, error display
- explicit job/run domain-notice refresh
- responsive/mobile layout
- actual Chromium live fixture와 durable SQLite assertions

## 공개 계약

UI는 `automation.create/list/get/update/run_now/history`만 호출한다. Notice는 invalid partial state를 직접 적용하지 않고 canonical list/history를 다시 조회하는 trigger로만 사용한다. Update는 selected revision을 보내며 conflict 후 canonical state를 reload한다.

## 상태 전이

```text
CREATE form → automation.create → EDIT selected
EDIT → automation.update(expectedRevision) → revised canonical job
Run now → durable requestKey → PENDING → CLAIMED → RUNNING → SUCCEEDED|FAILED
Replay last request → same AutomationRun, created=false
job/run notice → canonical list/history reload
```

## 실패 및 복구

- protocol validation/conflict → action `FAILED`, error alert, canonical list reload
- notice gap → existing UI snapshot resynchronization
- disconnected protocol → existing bounded reconnect with non-secret cursor
- live browser failure → browser evidence plus durable job/run/AgentRun ledger evidence
- cleanup failure → primary failure preserved and cleanup diagnostic emitted

## Acceptance

- STEP012D UI focused 5/5
- STEP012C integration focused 5/5
- canonical serial suite dynamic inventory, zero failure/skip
- architecture and package exports
- exact Vue 3.5.40 acquisition/integrity
- actual Chromium STEP012D live PASS
- immutable STEP012CR1 marker/SHA
- manifest pre/post unchanged
- deterministic source/fresh ZIP

## 반복 방지 기록

- `OR-ISSUE-067` interval anchor edit drift
- `OR-ISSUE-068` historical browser owner cutover drift
- `OR-ISSUE-069` historical root-document expectation drift
- `OR-ISSUE-070` Protocol idempotency masking durable replay
- `OR-ISSUE-071` accepted baseline version stale false positive
- `STEP012D_FAILURE_PREVENTION_AUDIT.md`
- Registry + recurrence gates are mandatory closure checks.

## 패키징 산출물

- `openrill-step012d-automation-control-ui-windows-vertical-slice-v1.zip`
- SHA-256 sidecar
- STEP012D acceptance report
- exact accepted baseline evidence and issue/prevention documents

## 제외

- delete Automation operation
- failure backoff implementation and auto-disable execution policy
- active-run cancellation on disable
- event-driven triggers
- distributed scheduler authority beyond SQLite lease ownership

## 완료 선언

Source/fresh deterministic gates와 actual Windows Chromium marker가 모두 PASSED일 때만 STEP012D를 완료한다. Static/fake Vue tests alone do not close this STEP.
