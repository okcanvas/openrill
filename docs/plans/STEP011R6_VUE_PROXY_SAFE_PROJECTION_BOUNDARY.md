# STEP011R6_VUE_PROXY_SAFE_PROJECTION_BOUNDARY

## 목적

Windows STEP011R5의 actual Chromium 증거가 확정한 Vue reactive Proxy와 browser `structuredClone` 경계 실패를 제거한다.

## 기준선

```text
feature                            = STEP011_CONTROL_UI_VERTICAL_SLICE
current release                    = 0.11.6-step011r6
previous candidate                 = STEP011R5_APPROVAL_TTL_PROCESS_TIMEOUT_SEPARATION
accepted Windows baseline          = STEP010AR1 121/121 ACCEPTED
schema                             = 7
framework                          = VUE_3
```

## Windows 실패 증거

```text
vueVersion=3.5.40
appShell=true
connection=CONNECTED
alert=Failed to execute 'structuredClone' on 'Window': #<Object> could not be cloned.
ApprovalsNo approvals.
STEP011R5 checks=163/164 state=FAILED
```

## 코드 확인

- `conversation.value = await call("conversation.get", ...)` stores JSON in a normal Vue `ref`.
- Vue deep reactivity exposes object values through a Proxy.
- `fixtureFrom(conversation.value, ...)` forwards the Proxy to the framework-neutral projection.
- `cloneRecord()` and card cloning used `structuredClone` directly.
- R5 pre-fix build plus Proxy fixture reproduced the exact `DataCloneError`.
- the R4 fake runtime used a non-proxying `ref`, so the defect was outside its test model.

## 구현 범위

- bootstrap/protocol object owners change from `ref` to `shallowRef`
- scalar UI owners remain `ref`
- projection remains `reactive`
- projection-owned recursive JSON-like clone replaces `structuredClone`
- Proxy snapshot, Proxy notice, source-boundary focused tests
- OR-ISSUE-052 registry/detail/recurrence gate
- R6 acceptance, launchers, deterministic package script, handoff documents

## 공개 계약

No Local Protocol operation, schema, approval decision, artifact, workspace, CSP, or route contract changes.

```text
transport object ownership = SHALLOW_REF
projection clone boundary   = PROXY_SAFE_JSON_LIKE_COPY
approval TTL                = 120000
process timeout             = 5000
```

## 상태 전이

```text
server JSON
-> LocalProtocolClient result
-> shallowRef whole-value replacement
-> fixtureFrom raw JSON-like object
-> proxy-safe detached projection copy
-> reactive projection render
```

## 실패 및 복구

Unsupported cyclic/non-JSON application objects are outside the protocol contract. Local Protocol and bootstrap payloads remain JSON-serialized. Browser action errors remain visible through the existing alert path.

## Acceptance

- focused Proxy boundary 3/3
- canonical serial suite 155/155, 28 files, skipped zero
- architecture/export pass
- STEP011 actual Vue 3.5.40 Chromium full regression
- STEP010 live regression
- source/fresh manifest, report, and ZIP identity

## 반복 방지 기록

```text
OR-ISSUE-052
reference/validation/STEP011R5_VUE_REACTIVE_PROXY_STRUCTURED_CLONE_FAILURE.md
### Vue reactive Proxy / projection serialization boundary
```

## 패키징 산출물

```text
openrill-step011r6-vue-proxy-safe-projection-boundary-v1.zip
openrill-step011r6-vue-proxy-safe-projection-boundary-v1.zip.sha256.txt
STEP011R6_ACCEPTANCE_REPORT.txt
PACKAGE_MANIFEST.json
```

## 제외

- CSP 완화
- Vue full compiler build 복귀
- approval timeout 재확장으로 오류 은폐
- server JSON shape 변경
- actual browser gate 제거 또는 mock 대체

## 완료 선언

Windows actual Chromium에서 nested STEP011과 STEP011R6가 모두 PASSED일 때만 STEP011 기능을 accepted baseline으로 승격한다.
