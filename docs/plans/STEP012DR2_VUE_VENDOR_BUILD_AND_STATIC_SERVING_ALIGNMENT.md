# STEP012DR2_VUE_VENDOR_BUILD_AND_STATIC_SERVING_ALIGNMENT

## 목적

STEP012DR1 Windows actual Chromium이 `/vendor/vue.runtime.global.prod.js` 404로 시작하지 못한 원인을 timeout 증가나 runtime 우회 없이 제거한다. Exact Vue acquisition, build materialization, Host static serving, Chromium execution을 하나의 검증 가능한 체인으로 정렬한다.

## 기준선

- official accepted baseline: `STEP012CR1_HISTORICAL_BROWSER_REGRESSION_OWNERSHIP` Windows `101/101`
- immutable accepted ZIP SHA-256: `3f2a47484f6341be98c00f189c12e2df7ec0e14e308de382d6bafddc90117062`
- failed candidate: `STEP012DR1_HOST_READY_AND_UI_BOOTSTRAP_PHASE_ALIGNMENT` version `0.12.7-step012dr1`
- current revision: `STEP012DR2_VUE_VENDOR_BUILD_AND_STATIC_SERVING_ALIGNMENT` version `0.12.8-step012dr2`
- retained feature: `STEP012D_AUTOMATION_CONTROL_UI_WINDOWS_VERTICAL_SLICE`
- state schema: 9

## 코드 확인

R1 Windows evidence에서 Host는 READY였고 `/ui/bootstrap`은 200이었다. 실패는 Vue runtime URL의 404였다. `workspace-runner.mjs`는 vendor 환경이 build 시점에 존재할 때만 `dist/public/vendor`를 생성하지만 R1 acceptance는 vendor 획득 전에 build하고 획득 후에는 live script만 실행했다.

## 구현 범위

- exact vendor 획득 후 vendor-aware workspace build
- built static vendor 3파일 byte equality
- Host-served runtime/lock HTTP preflight
- status/MIME/bytes/SHA evidence
- Chromium launch 전 static serving fail-closed
- OR-ISSUE-074 상세 문서, Registry, recurrence gate
- focused 4/4 static serving tests

## 공개 계약

```text
Browser runtime ready
= acquired Vue integrity valid
+ vendor-aware build passed
+ dist/public/vendor bytes identical
+ HTTP runtime status 200
+ JavaScript MIME
+ served runtime SHA identical
+ served lock bytes identical
```

## 상태 전이

```text
ACQUIRE_VENDOR
→ VERIFY_VENDOR
→ BUILD_WITH_VENDOR
→ VERIFY_DIST_VENDOR
→ START_HOST_READY
→ VERIFY_HTTP_VENDOR
→ START_CHROMIUM
→ UI READY
```

어느 경계에서든 실패하면 다음 단계로 진행하지 않는다.

## 실패 및 복구

- vendor acquisition unavailable: 기존 `runtime_unavailable` 분류 유지
- vendor-aware build failure: build TAP/output의 bounded primary failure 보존
- dist byte drift: 정확한 file name 보존
- HTTP 404/MIME/hash drift: `OPENRILL_VUE_STATIC_EVIDENCE_BEGIN/END` 보존
- Chromium/runtime failure: 기존 browser/startup evidence 보존
- cleanup과 manifest pre/post 불변성 유지

## Acceptance

- STEP012D UI/bootstrap focused 6/6
- Host READY focused 2/2
- Vue static serving focused 4/4
- STEP012C integration 5/5
- canonical serial suite dynamic inventory, zero fail/skip
- architecture and exports
- exact Vue 3.5.40 acquisition/re-extraction
- vendor-aware build and dist byte equality
- Host HTTP runtime/lock byte equality
- actual Windows Chromium Automation vertical slice
- manifest pre/post unchanged
- deterministic source/fresh ZIP

Local deterministic result: `158/159`, sole missing aggregate `runtime_unavailable`; canonical `222/222`, unit files 40, report SHA-256 `a4804a90251cec1d1ace0f5c1392afe349e313b6b265a11d619b6164f10b399a`.

## 반복 방지 기록

- `OR-ISSUE-074`
- `STEP012DR1_WINDOWS_VUE_VENDOR_NOT_MATERIALIZED_IN_STATIC_ROOT.md`
- `live-vue-static.mjs` preflight helper
- focused 404/byte-identical fixture
- Issue Registry와 recurrence gate 동시 갱신

## 패키징 산출물

- `openrill-step012dr2-vue-vendor-build-static-serving-alignment-v1.zip`
- SHA-256 sidecar
- `STEP012DR2_ACCEPTANCE_REPORT.txt`
- OR-ISSUE-074 상세 증거
- README/HANDOFF/PLANS/ROADMAP/VALIDATION

## 제외

- CDN Vue 사용
- CSP 완화
- 404를 무시하고 browser timeout만 증가
- acquired vendor와 다른 runtime 제공 허용
- Automation 기능 범위 변경
- delete/backoff/active cancellation/event trigger

## 완료 선언

Focused/canonical/source/fresh 검증과 actual Windows Chromium marker가 모두 PASSED일 때만 R2를 완료한다.
