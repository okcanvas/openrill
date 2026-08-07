# STEP011R5_APPROVAL_TTL_PROCESS_TIMEOUT_SEPARATION

## 목적

Windows STEP011R4 actual Chromium 결과가 확정한 `APPROVAL_EXPIRED` 원인을 제거한다. 프로세스 실행 제한과 사람이 승인할 수 있는 대기 시간을 서로 다른 설정·배선으로 분리하고, STEP011 Vue 3 Control UI 수직 흐름을 실제 Chromium에서 다시 검증한다.

## 기준선

```text
previous official Windows baseline = STEP010AR1 121/121 ACCEPTED
feature under validation           = STEP011_CONTROL_UI_VERTICAL_SLICE
input correction candidate         = STEP011R4 151/152 FAILED on Windows
current release                    = 0.11.5-step011r5
schema                             = 7
framework                          = VUE_3
```

STEP011R4의 runtime-only Vue, strict CSP, explicit favicon, reactive approval deep link 수정은 그대로 보존한다.

## Windows 실패 증거

```text
process.run output.error.code = APPROVAL_EXPIRED
message                       = approval request expired
STEP011                       = 216/217 FAILED
STEP011R4                     = 151/152 FAILED
```

실패는 Vue mount, CSP, WebSocket 연결, approval 화면 렌더링 이전이 아니다. 실제 pending approval이 생성된 뒤 operator browser flow가 완료되기 전에 expiry 결과가 Run에 append되었다.

## 코드 확인

- `ApprovalServiceOptions.timeoutMs`는 `expiresAt = now + timeoutMs`를 소유한다.
- `ProcessManagerOptions.defaultTimeoutMs`는 foreground child timer를 소유한다.
- Host는 두 독립 입력에 모두 `options.config.execution.defaultTimeoutMs`를 전달했다.
- STEP011 fixture는 해당 값을 `5000`으로 설정했다.
- Host expiry timer는 250 ms마다 pending approval을 만료하고 `APPROVAL_EXPIRED` Tool result를 append한다.

따라서 실제 원인은 Windows 속도 추측이 아니라 서로 다른 두 시간 계약의 Host/config 결합이다.

## 구현 범위

- `SourceExecutionConfig`와 materialized config에 `approvalTimeoutMs` 추가
- closed config schema와 기본값 갱신
- Host approval wiring을 `approvalTimeoutMs`로 변경
- ProcessManager wiring은 `defaultTimeoutMs` 유지
- STEP011 live fixture에서 process `5000`, approval `120000`을 동시에 선언
- focused unit, canonical suite, actual Chromium full regression 추가 검증
- OR-ISSUE-051 상세 증거와 recurrence gate 기록

## 공개 계약

```yaml
execution:
  approvalMode: ask
  defaultTimeoutMs: 5000
  approvalTimeoutMs: 120000
```

- `defaultTimeoutMs`: `process.run` 입력이 `timeoutMs`를 생략한 경우의 child 실행 제한
- `approvalTimeoutMs`: pending approval이 `EXPIRED`로 전이되기 전 operator decision window
- 기존 설정은 `approvalTimeoutMs` 생략 시 120000을 사용한다.
- process/approval timeout은 각각 독립적으로 검증되고 materialized snapshot에 기록된다.

## 상태 전이

Approval 상태 전이는 변경하지 않는다.

```text
PENDING → APPROVED → CONSUMED
        → DENIED
        → EXPIRED
        → CANCELLED
```

변경점은 `PENDING → EXPIRED`의 deadline 소유자가 process execution timeout과 분리된다는 것이다.

## 실패 및 복구

- `approvalTimeoutMs` 경과 전 resolve는 기존 version/binding atomic consume 계약을 따른다.
- 경과 후에는 기존과 동일하게 `APPROVAL_EXPIRED` durable Tool result를 정확히 한 번 append한다.
- `defaultTimeoutMs` 경과는 child process만 `PROCESS_TIMEOUT`으로 종료한다.
- 기존 config에서 새 필드를 생략해도 120000 ms approval 기본값으로 materialize한다.
- DB schema, migration, existing approval rows는 변경하지 않는다.

## Acceptance

```text
focused timeout-separation tests = 4/4
canonical serial suite           = 152/152, unit_files=27, skipped=0
STEP011 nested                   = 217/217 with actual Chromium
STEP011R5 outer                  = all checks passed
```

Source와 fresh-ZIP에서 동일 acceptance를 실행하고 package manifest와 generated-file cleanup을 확인한다.

## 반복 방지 기록

- OR-ISSUE-051 registry row
- `STEP011R4_APPROVAL_TTL_PROCESS_TIMEOUT_COUPLING.md`
- `Approval TTL / process timeout separation` recurrence section
- focused test에서 old lifecycle coupling expression 부재 검증

## 패키징 산출물

```text
openrill-step011r5-approval-ttl-process-timeout-separation-v1.zip
openrill-step011r5-approval-ttl-process-timeout-separation-v1.zip.sha256.txt
PACKAGE_MANIFEST.json
STEP011R5_ACCEPTANCE_REPORT.txt
```

## 제외

- 승인 상태 머신 재설계
- approval duration UI 변경
- SQLite schema/migration 변경
- CSP 완화
- actual Chromium을 mock browser로 대체
- STEP012 automation 구현

## 완료 선언

Source/fresh-ZIP deterministic checks와 실제 Windows Chromium nested marker가 모두 통과하기 전에는 STEP011을 accepted baseline으로 승격하지 않는다. 그 전까지 공식 accepted baseline은 STEP010AR1이다.
