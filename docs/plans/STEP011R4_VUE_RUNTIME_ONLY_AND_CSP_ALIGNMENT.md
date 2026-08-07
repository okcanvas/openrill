# STEP011R4_VUE_RUNTIME_ONLY_AND_CSP_ALIGNMENT

## 목적

Windows STEP011R3 actual Chromium evidence가 확정한 Vue runtime compiler/CSP 불일치를 제거하고, strict CSP를 약화하지 않은 채 Control UI 전체 수직 흐름을 다시 수용한다.

## 기준선

```text
previous official Windows baseline = STEP010AR1 121/121 ACCEPTED
feature under validation           = STEP011_CONTROL_UI_VERTICAL_SLICE
input correction candidate         = STEP011R3 160/161 FAILED on Windows
current release                    = 0.11.4-step011r4
schema                             = 7
framework                          = VUE_3
```

## Windows 실패 증거

```text
readyState=complete
vueVersion=3.5.40
appShell=false
EvalError: Evaluating a string as JavaScript violates CSP
at Function (<anonymous>)
at /vendor/vue.global.prod.js
```

동일 evidence에는 implicit `/favicon.ico` 404도 포함되었다.

## 코드 확인

- `browser-app.ts`가 `createApp({ template: ... })`를 사용했다.
- vendor script가 compiler 포함 `package/dist/vue.global.prod.js`를 추출했다.
- Host CSP는 의도적으로 `'unsafe-eval'`을 허용하지 않았다.
- approval deep-link computed는 `location.hash`를 읽지만 reactive dependency가 없었다.

## 구현 범위

1. `template:` 제거와 `h()` render function 전환
2. exact Vue package의 `vue.runtime.global.prod.js` 공급
3. CSP `'unsafe-eval'` 금지 유지
4. explicit same-origin SVG favicon
5. reactive route hash/deep-link state
6. fake runtime-only Vue mount test
7. exact Vue + actual Chromium 전체 STEP011 회귀

## 공개 계약

```text
Vue version        = 3.5.40
Vue browser file   = vue.runtime.global.prod.js
runtime templates  = forbidden
unsafe-eval        = forbidden
UI state authority = Local Protocol only
browser acceptance = actual Chromium
```

## 상태 전이

```text
HTML/JS/Vue runtime load
→ setup returns render function
→ app shell mounts without runtime compilation
→ bootstrap
→ WebSocket CONNECTED
→ Conversation send
→ Approval allow_once
→ Artifact open
→ reload cursor resume
→ mobile/accessibility checks
→ durable ledger verification
```

## 실패 및 복구

- runtime-only file/version/hash/license mismatch는 fail closed한다.
- `template:`, `eval`, `new Function`, `'unsafe-eval'` 발견 시 acceptance 실패다.
- actual Chromium evidence에 runtime/network error가 남으면 실패다.
- exact Vue를 획득하지 못하는 환경에서는 candidate만 생성하고 완료 선언하지 않는다.

## Acceptance

```text
focused STEP011R4 tests      = 4/4
canonical serial suite       = 148/148, 26 files, skipped 0
nested STEP011 browser       = all checks PASSED
STEP011R4 final              = all checks PASSED
```

## 반복 방지 기록

```text
OR-ISSUE-048 Vue runtime compiler/CSP mismatch
OR-ISSUE-049 implicit favicon HTTP failure
OR-ISSUE-050 same-route approval deep-link reactivity
```

각 항목은 Registry + 상세 증거 + 자동 gate를 가진다.

## 패키징 산출물

```text
openrill-step011r4-vue-runtime-only-csp-alignment-v1.zip
SHA-256 sidecar
PACKAGE_MANIFEST.json
source/fresh acceptance report
```

## 제외

- CSP에 `'unsafe-eval'` 추가
- 다른 Vue 버전 또는 mock runtime
- CDN product dependency
- STEP012 scheduler 구현

## 완료 선언

Windows에서 exact Vue `3.5.40`과 actual Chromium을 사용해 nested STEP011과 STEP011R4가 모두 PASSED인 경우에만 baseline 승격을 선언한다.
