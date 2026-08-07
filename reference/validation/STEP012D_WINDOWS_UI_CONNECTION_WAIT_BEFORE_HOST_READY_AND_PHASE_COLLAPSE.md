# STEP012D Windows Automation UI connection wait before Host READY and startup phase collapse

## 이슈

```text
OR-ISSUE-072
STEP012D_WINDOWS_UI_CONNECTION_WAIT_BEFORE_HOST_READY_AND_PHASE_COLLAPSE
```

## 실제 실패 명령과 증상

Windows에서 다음 명령을 실행했다.

```cmd
cd /d D:\NODE_AGENTS\okcanvas-openrill
pnpm acceptance:step012d
```

Canonical suite는 통과했지만 actual Chromium vertical slice가 다음 위치에서 종료됐다.

```text
[PASS] canonical-suite :: suite_pass
[FAIL] step012d-exact-vue-actual-chromium :: file:///D:/NODE_AGENTS/okcanvas-openrill/scripts/browser-page-evidence.mjs:127
Error: browser wait timeout: Automation UI connected
```

사용자가 제공한 로그에는 `OPENRILL_BROWSER_EVIDENCE_BEGIN/END` 전체가 포함되지 않았으므로, 그 Windows 실행에서 fetch, WebSocket handshake, 초기 projection operation 중 정확히 어느 단계가 마지막으로 실패했는지는 단정하지 않는다.

## 코드로 확정한 원인

### 1. Live fixture가 Host의 첫 metadata를 READY로 오인

STEP012D의 기존 `launchHost()`는 `host.json`을 JSON으로 읽는 즉시 반환했다. Host는 lifecycle 중 먼저 다음 metadata를 쓴다.

```text
state=LISTENING
readiness=false
```

이후 migration, repository, Automation scheduler/executor, protocol operation registry 준비가 끝난 뒤 `READY/readiness=true`를 쓴다. 기존 fixture는 LISTENING metadata만으로 브라우저를 열 수 있었다.

### 2. UI가 startup 실패 단계를 하나의 FAILED 상태로 축약

기존 `bootstrapApp()`은 다음 경계를 연속 실행했다.

```text
/ui/bootstrap fetch
→ Local Protocol connect
→ workspace/approval/artifact/automation/conversation/host projection load
```

그러나 어느 단계에서 오류가 나도 `onMounted` catch는 `connection=FAILED`와 일반 alert만 남겼다. 따라서 실제 transport가 연결된 뒤 projection 하나가 실패해도 outer wait에는 단순한 `Automation UI connected` timeout으로 보였다.

## 직접 실행 증거

동일한 STEP012D config와 실제 Host를 사용하되 `READY/readiness=true`를 기다린 뒤 Node Local Protocol client로 초기 UI 호출 순서를 실행했다.

```text
/ui/bootstrap = HTTP 200
WebSocket open/handshake = accepted
workspace.list = OK
approval.list = OK
artifact.list = OK
automation.list = OK
conversation.list = OK
host.status = OK
```

이 증거는 Automation server operations가 READY 이후 정상임을 확인한다. 실제 Windows browser failure의 정확한 하위 단계는 전체 browser evidence가 없으므로 R1 Windows rerun으로 확인해야 한다.

## 영향

- Host가 아직 STARTING인데 actual Chromium을 시작할 수 있다.
- 같은 시스템 속도에서도 Windows process/I/O timing에 따라 재현 여부가 달라질 수 있다.
- transport 연결 실패와 초기 projection 실패가 동일한 timeout으로 축약된다.
- 실제 원인 없이 timeout 증가만 반복할 위험이 있다.

## 수정

1. 공용 `waitForReadyHostMetadata()`를 추가한다.
2. STEP011과 STEP012D actual-browser fixture 모두 `state=READY`, `readiness=true`, 유효 port를 만족할 때만 브라우저를 연다.
3. UI startup을 `FETCH_BOOTSTRAP`, `PARSE_BOOTSTRAP`, `CONNECT_PROTOCOL`, 각 `LOAD_*`, `READY`, `FAILED` 단계로 공개한다.
4. transport 연결 상태와 startup projection phase를 분리한다.
5. browser page evidence에 `startupPhase`를 포함한다.
6. timeout 시 Host metadata, redacted bootstrap summary, UI phase/alert, bounded Host output을 `OPENRILL_STEP012D_STARTUP_EVIDENCE_BEGIN/END`로 보존한다.
7. bootstrap token, provider secret, 절대 workspace payload는 startup evidence에 기록하지 않는다.

## 수정 전 재현과 회귀 gate

- LISTENING metadata를 먼저 기록하고 READY를 지연시키는 fixture에서 helper는 LISTENING으로 resolve하면 안 된다.
- READY metadata 이후에만 resolve해야 한다.
- READY timeout은 마지막 metadata/read error/bounded output을 보존해야 한다.
- source gate는 STEP011/STEP012D live fixture 모두 공용 READY helper를 사용함을 검사한다.
- source gate는 phased startup과 `startupPhase` browser evidence를 검사한다.
- actual Chromium wait는 `connection=CONNECTED`와 `startupPhase=READY`를 함께 요구한다.

## 종료 조건

다음 exact Windows marker가 통과하기 전에는 이 이슈를 live accepted로 종료하지 않는다.

```text
STEP012DR1_HOST_READY_AND_UI_BOOTSTRAP_PHASE_ALIGNMENT ... state=PASSED schema=9 host_ready=AWAITED startup=PHASED evidence=STARTUP_BOUNDED ui=AUTOMATION_CRUD_RUN_HISTORY browser=CHROMIUM mobile=PASS
```
