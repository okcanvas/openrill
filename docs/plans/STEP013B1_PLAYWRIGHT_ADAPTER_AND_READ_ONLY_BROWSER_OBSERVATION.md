# STEP013B1 — Playwright Adapter and Read-Only Browser Observation

## 목적

STEP013A의 provider-neutral lifecycle 경계를 유지한 채 실제 Chromium을 실행하는 별도 Playwright adapter와 read-only Browser 관찰 Tool을 연결한다. OpenClaw의 누적 Browser 전체를 복제하지 않고 `stable page identity → snapshot ref → navigation invalidation → later action` 순서의 첫 구간만 닫는다.

## 기준선

```text
accepted_baseline=STEP013AR4_ACCEPTANCE_STAGE_RUNNER_FIXTURE_IMPORT_ALIGNMENT
accepted_version=0.13.4-step013ar4
accepted_checks=190/190
accepted_zip_sha256=4ea292f9e68b6774a7828565e1e7e8d5df7b4c778b36ad5891e1ea6adf2fc61e
current_step=STEP013B1_PLAYWRIGHT_ADAPTER_AND_READ_ONLY_BROWSER_OBSERVATION
current_version=0.13.5-step013b1
schema=9
```

## 코드 확인

기준 ZIP과 OpenClaw ZIP을 직접 해제하고 다음 파일을 확인했다.

```text
OpenRill
packages/browser-runtime/src/types.ts
packages/browser-runtime/src/runtime.ts
services/agent-host/src/lifecycle.ts
packages/tool-runtime/src/index.ts
packages/config/src/schema.ts

OpenClaw
extensions/browser/src/browser-tool.schema.ts
extensions/browser/src/browser-tool-session-tabs.ts
extensions/browser/src/browser/pw-session-state.ts
extensions/browser/src/browser/pw-tools-core.snapshot.ts
extensions/browser/src/browser/pw-session-navigation.ts
extensions/browser/src/browser/chrome.executables.ts
```

파일별 SHA-256과 채택/비채택 판단은 `reference/validation/STEP013B1_OPENCLAW_BROWSER_OBSERVATION_REFERENCE_AUDIT.md`에 고정한다.

## 구현 범위

### `packages/browser-playwright`

- exact `playwright-core 1.62.0` binding;
- explicit/PATH/limited system Chromium discovery;
- browser 자동 다운로드 없음;
- `BrowserDriver`, `BrowserProcessHandle`, `BrowserContextHandle`, `BrowserPageHandle` 구현;
- popup/download/main-frame-navigation event 변환;
- body text와 CDP accessibility tree의 bounded snapshot;
- abort 뒤 늦게 완료된 launch cleanup;
- normal close/disconnect의 idempotent process retirement.

### `packages/browser-runtime`

- provider-neutral `title()`와 `snapshot()` page contract;
- `documentGeneration`과 public element ref;
- same-document stable ref;
- main-frame navigation 즉시 invalidation;
- `BROWSER_STALE_REF`;
- owner-scoped status/open/list/navigate/snapshot/close helpers;
- six closed Tool schemas.

### Host

- Browser enabled 시 별도 injection이 없으면 concrete Playwright adapter 조립;
- executable preflight는 profile lock 이전;
- Tool Registry에 six Browser tools 등록;
- Run cancellation은 해당 Run의 Browser session만 종료;
- shutdown은 BrowserRuntime drain 후 State close.

## 공개 계약

```text
browser.status {}
browser.open {url?}
browser.list {sessionId?}
browser.navigate {sessionId,pageId,url}
browser.snapshot {sessionId,pageId}
browser.close {sessionId,pageId?}
```

모든 schema는 closed이며 Browser protocol operation과 DB migration은 추가하지 않는다.

## 상태 전이

```text
Runtime IDLE
→ single-flight LAUNCHING
→ READY
→ Run-owned Session OPEN
→ Page OPEN / documentGeneration=N
→ snapshot refs eN-1...
→ main-frame navigation
→ documentGeneration=N+1 / previous refs cleared
→ page/session close
→ Host shutdown CLOSING
→ process/context/page/driver drain
→ CLOSED
```

## 실패 및 복구

- executable 없음: profile lock 이전 명확한 startup failure;
- Playwright package 없음: `OPENRILL_PLAYWRIGHT_CORE_UNAVAILABLE`;
- launch 실패: `OPENRILL_PLAYWRIGHT_LAUNCH_FAILED`를 BrowserRuntime 실패로 변환;
- launch timeout/cancel: original launch Promise를 계속 관찰하고 late Browser close;
- snapshot 도중 document 변경: `OPENRILL_PLAYWRIGHT_DOCUMENT_CHANGED`, caller retry;
- 이전 ref: `BROWSER_STALE_REF`;
- disconnect: runtime generation invalidation과 stale handle 차단.

반복 가능한 결함은 OR-ISSUE-090~092와 자동 게이트에 기록한다.

## Acceptance

```text
Host start
→ concrete adapter launch
→ Run-owned session/page
→ local deterministic fixture
→ browser.list
→ browser.navigate /one
→ browser.snapshot role/name/ref
→ browser.navigate /two
→ old ref BROWSER_STALE_REF
→ new generation/new refs
→ browser.close
→ Host/runtime shutdown
→ adapter activeProcessCount=0
→ unique command-line marker Chromium orphan=0
```

Acceptance는 build, focused tests, canonical serial suite, architecture/export gates, source/lock/module-link alignment, package-manifest pre/post, source/fresh ZIP equality를 포함한다.

## 반복 방지 기록

- OR-ISSUE-090: provider-neutral 타입으로 widening 후 adapter metadata 접근;
- OR-ISSUE-091: normal close 뒤 driver set에 process handle 잔존;
- OR-ISSUE-092: abort race 뒤 late launch Browser orphan 가능성.

## 패키징 산출물

```text
openrill-step013b1-playwright-adapter-read-only-browser-observation-v1.zip
openrill-step013b1-playwright-adapter-read-only-browser-observation-v1.zip.sha256.txt
```

ZIP은 source-only deterministic package이며 `node_modules`, `dist`, `.artifacts`, runtime DB를 포함하지 않는다.

## 제외

```text
click/type/fill/select/press/wait/evaluate/batch
screenshot/PDF/download/upload Artifact
console/page-error/network evidence
dialog response
persistent profile/existing user Chrome attach
Browser action ledger
Automation-triggered Browser Run
```

## 완료 선언

STEP013B1은 Windows에서 exact frozen install 후 full acceptance와 real Chromium orphan-zero marker가 통과하기 전까지 candidate다. accepted baseline은 그때까지 STEP013AR4다.
