# STEP013A Browser Runtime lifecycle and policy foundation

## 목적

STEP012DR4 Windows-live accepted baseline 위에, 공개 Browser Tool보다 먼저 필요한 Browser process/context/page lifecycle, Run ownership, navigation policy, bounded timeout, crash invalidation, idle cleanup, Host shutdown quiescence를 제품 소유 코드로 고정한다.

## 기준선

```text
accepted_step=STEP012DR4_AUTOMATION_HISTORY_ROW_SELECTOR_ISOLATION
accepted_version=0.12.10-step012dr4
accepted_checks=180/180
accepted_zip_sha256=46097b9ec753b46741705823a5a9a67ab191d6fe3350db43f64e43b516807658
current_step=STEP013A_BROWSER_RUNTIME_LIFECYCLE_AND_POLICY_FOUNDATION
current_version=0.13.0-step013a
schema=9
```

Accepted ZIP은 수정하지 않는다. `reference/validation/STEP012DR4_WINDOWS_LIVE_ACCEPTED.md`가 별도 closure evidence를 소유한다.

## OpenClaw 참조

`openclaw-main.zip` SHA-256 `1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82`를 구현 정답지 성격의 reference로 코드 감사했다. 정확한 파일·SHA·채택 계약·의도적 차이는 `STEP013A_OPENCLAW_BROWSER_REFERENCE_AUDIT.md`에 고정한다.

채택:

- destructive transition 전 actor invalidation;
- single-flight launch와 generation lease;
- session/tab ownership 및 idle cleanup;
- URL credential/scheme/private-network/final-redirect 검사;
- shutdown drain과 cleanup error 보존.

채택하지 않음:

- OpenClaw HTTP control server, extension relay, Gateway proxy, profile import, Chrome MCP/CDP route;
- OpenClaw product dependency 또는 source import;
- persistent profile/download 저장;
- STEP013A의 public Browser Tool 또는 Playwright binding.

## 코드 확인

Accepted baseline의 `packages/browser-runtime`은 package identity 외 기능이 없는 stub이었다. `packages/tools-browser`, Browser protocol operation, Browser state migration, Playwright dependency는 없었다. Host ToolRegistry는 file/process Tool만 소유했다.

STEP013A 코드 감사 중 다음 실제 결함/near-miss를 확인했다.

- OR-ISSUE-077: accepted DR4 manifest와 source/Host version identity drift;
- OR-ISSUE-078: Browser driver 누락 preflight가 profile lock 뒤에 위치할 뻔한 경계;
- OR-ISSUE-079: awaited timeout timer `unref()`와 AbortSignal 무시 adapter가 terminal result를 만들지 못한 결함;
- OR-ISSUE-080: Host shutdown test가 generic event-loop turn으로 drain 진입을 추정한 결함;
- OR-ISSUE-081: historical materialized config와 shutdown static gate가 Browser section/drain을 반영하지 못한 결함;
- OR-ISSUE-082: historical root ownership test가 latest accepted DR4 승격을 거부한 결함.

## 구현 범위

- provider-neutral injected `BrowserDriver` 계약;
- `BrowserRuntime` state: IDLE/LAUNCHING/READY/FAILED/CLOSING/CLOSED;
- single-flight process launch와 generation invalidation;
- `workspaceId + conversationId + runId + attemptId` owner;
- isolated context, persistent storage deny, download deny;
- session/page pre-creation limits;
- page popup close와 download cancellation;
- Run cancellation scoped session cleanup;
- idle session sweep;
- operation/launch bounded timeout;
- requested URL 및 final URL 정책 재검사;
- Host config closed defaults/bounds;
- Host pre-lock driver availability check;
- Host shutdown에서 Browser/Process drain 후 SQLite close;
- current source/manifest/Host version alignment verifier.

## 공개 계약

### Browser owner

```text
workspaceId
conversationId
runId
attemptId
```

### 기본 config

```text
browser.enabled=false
browser.headless=true
launchTimeoutMs=30000
actionTimeoutMs=15000
idleTimeoutMs=300000
sweepIntervalMs=30000
maxSessions=4
maxPagesPerSession=8
allowPrivateNetwork=false
allowedHostnames=[]
```

### navigation

허용은 `http:`, `https:`, exact `about:blank`뿐이다. URL credential은 내용 노출 없이 거부한다. private/loopback IP 또는 그러한 주소로 해석되는 hostname은 기본 거부한다. 명시 allowlist 또는 `allowPrivateNetwork=true`만 예외다. redirect 이후 final URL도 동일 정책으로 다시 검사한다.

## 상태 전이

```text
IDLE -> LAUNCHING -> READY
LAUNCHING -> FAILED
READY -> FAILED          browser disconnect
IDLE|READY|FAILED -> CLOSING -> CLOSED
```

Browser disconnect는 generation을 증가시키고 기존 session/page handle을 stale로 만든다. close는 첫 await 전에 CLOSING으로 전환해 신규 작업을 차단한다.

## 실패 및 복구

- launch/action timeout은 adapter Promise와 referenced timeout rejection을 race한다;
- AbortSignal을 무시하는 adapter도 bounded terminal error를 낸다;
- Browser disconnect 후 stale handle은 fail closed한다;
- fresh launch는 새 generation에서만 가능하다;
- popup/download는 runtime boundary에서 close/cancel한다;
- close는 admitted operation을 기다리고 모든 page/context/browser/driver cleanup을 시도하며 첫 오류를 보존한다;
- `browser.enabled=true`인데 driver가 없으면 profile lock 전 startup을 거부한다.

## Acceptance

- BrowserRuntime actual focused 13/13;
- boundary/static focused 8/8;
- historical Host fixture/drain regression;
- source version alignment;
- canonical serial suite 251/251, 44 files, skipped 0;
- architecture 25 packages, 62 edges, 105 sources;
- package exports 25;
- schema 9, migration 010 zero;
- Browser Tool/protocol operation/Playwright/OpenClaw product dependency zero;
- package manifest pre/post unchanged;
- fresh ZIP acceptance/report/repack determinism.

Windows acceptance 명령:

```cmd
pnpm install --frozen-lockfile
pnpm acceptance:step013a
```

## 반복 방지 기록

OR-ISSUE-077부터 OR-ISSUE-082까지 각각 detail 문서, Issue Registry, Recurrence Prevention Gates, focused 또는 canonical gate를 함께 유지한다.

## 패키징 산출물

```text
openrill-step013a-browser-runtime-lifecycle-policy-foundation-v1.zip
openrill-step013a-browser-runtime-lifecycle-policy-foundation-v1.zip.sha256.txt
reference/validation/STEP013A_ACCEPTANCE_REPORT.txt
```

## 제외

- concrete Playwright adapter와 executable discovery;
- public `browser.*` Tool과 protocol surface;
- Browser durable DB ledger/schema migration;
- screenshot/download Artifact;
- Browser UI;
- Automation-triggered Browser execution;
- persistent profile/cookie/localStorage;
- OpenClaw source/dependency 포함.

## 완료 선언

STEP013A는 Windows에서 모든 code-level acceptance가 통과한 뒤 accepted로 승격한다. STEP013B가 concrete adapter와 Browser Tool publication을 소유한다.
