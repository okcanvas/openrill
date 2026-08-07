# STEP012DR1 Windows Vue vendor not materialized in Host static root

## 이슈

```text
OR-ISSUE-074
STEP012DR1_WINDOWS_VUE_VENDOR_NOT_MATERIALIZED_IN_STATIC_ROOT
```

## 실제 실패 명령과 증상

Windows에서 다음 명령을 실행했다.

```cmd
cd /d D:\NODE_AGENTS\okcanvas-openrill
pnpm acceptance:step012dr1
```

Focused와 canonical suite는 통과했고 Host startup evidence도 다음을 확인했다.

```text
state=READY
readiness=true
/ui/bootstrap status=200
version=0.12.7-step012dr1
```

그러나 actual Chromium은 Vue runtime을 받지 못했다.

```text
GET /vendor/vue.runtime.global.prod.js = 404 Not Found
content-type=application/json
Refused to execute script because MIME type application/json is not executable
Error: OpenRill Control UI requires the packaged Vue runtime
appShell=false
```

최종 오류는 다음이었다.

```text
Error: browser wait timeout: Automation UI ready
```

## 코드로 확정한 원인

`run_step012dr1_acceptance.py`의 실행 순서는 다음이었다.

```text
clean
→ workspace-runner.mjs build                # vendor 환경 없음
→ focused/canonical suite
→ exact Vue를 임시 vendor_root에 획득
→ run-step012d-live.mjs에 vendor_root 환경만 전달
```

`workspace-runner.mjs`는 `OPENRILL_VUE_RUNTIME_VENDOR_DIR`가 **build 시점에 존재할 때만** 다음 파일을 Host static root에 복사한다.

```text
apps/agent-web/dist/public/vendor/vue.runtime.global.prod.js
apps/agent-web/dist/public/vendor/vue.runtime.lock.json
apps/agent-web/dist/public/vendor/LICENSE.vue.txt
```

그러나 exact Vue 획득 뒤 vendor-aware build를 다시 수행하지 않았다. `run-step012d-live.mjs`는 임시 vendor 파일을 직접 읽어 integrity를 확인했지만 Host는 별도의 `apps/agent-web/dist/public`을 제공했다. 환경변수를 live child에 전달하는 것만으로 이미 생성된 static root가 변경되지는 않는다.

따라서 다음 두 상태가 동시에 존재했다.

```text
임시 vendor_root/runtime = 존재 및 integrity 통과
Host static root/vendor/runtime = 없음
```

Host control server는 없는 static file 요청을 JSON 404로 반환했고 Chromium의 strict MIME 검사가 실행을 차단했다.

## 영향

- vendor acquisition 성공이 실제 브라우저 제공 성공으로 잘못 해석된다.
- Host READY와 bootstrap HTTP 200이어도 UI framework가 시작되지 않는다.
- live script의 local vendor integrity 검증만으로 static serving 경계를 증명할 수 없다.
- 같은 결함이 다른 external runtime/static asset에도 반복될 수 있다.

## 수정

1. exact Vue 획득과 re-extraction 검증 이후 `OPENRILL_VUE_RUNTIME_VENDOR_DIR`를 설정한 상태로 `workspace-runner.mjs build`를 다시 실행한다.
2. build 후 dist static root의 runtime, lock, license가 acquired vendor와 바이트 단위로 동일한지 확인한다.
3. Host READY 이후 Chromium 실행 전에 `/vendor/vue.runtime.global.prod.js`와 `/vendor/vue.runtime.lock.json`을 HTTP로 조회한다.
4. status, MIME type, bytes, SHA-256, lock bytes가 acquired vendor와 동일해야만 Chromium을 시작한다.
5. 불일치 시 `OPENRILL_VUE_STATIC_EVIDENCE_BEGIN/END`에 bounded status/content/hash evidence를 남긴다.

## 수정 전 재현 및 자동 반복 방지 gate

- 404 server fixture에서 `verifyServedVueRuntime()`은 Chromium 전에 실패하고 status 404 evidence를 보존해야 한다.
- exact byte server fixture는 runtime과 lock을 모두 통과해야 한다.
- STEP012DR2 acceptance source는 vendor-aware build가 live script보다 먼저 실행됨을 검사한다.
- dist static root의 runtime/lock/license byte equality를 acceptance가 검사한다.
- live fixture는 Host-served Vue preflight를 `launchBrowser()` 전에 수행해야 한다.
- Issue Registry, recurrence document, focused 4/4, canonical suite, actual Windows Chromium gate가 함께 존재해야 한다.

## 종료 조건

다음 Windows marker가 통과하기 전에는 이 이슈를 live accepted로 종료하지 않는다.

```text
STEP012DR2_VUE_VENDOR_BUILD_AND_STATIC_SERVING_ALIGNMENT ... state=PASSED schema=9 host_ready=AWAITED startup=PHASED vendor_build=ALIGNED static_serving=BYTE_VERIFIED evidence=STARTUP_BOUNDED ui=AUTOMATION_CRUD_RUN_HISTORY browser=CHROMIUM mobile=PASS
```
