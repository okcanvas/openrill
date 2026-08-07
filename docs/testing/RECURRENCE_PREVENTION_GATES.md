# Recurrence Prevention Gates

## 목적

반복되는 환경·패키징·수용 러너 결함을 제품 기능과 분리해 영구적으로 차단한다.

## 상시 gate

### Package manager
- lockfile importer는 null일 수 없다.
- workspace와 lockfile의 pnpm settings가 일치해야 한다.
- frozen install을 우회하지 않는다.

### Windows process and text
- child output은 bytes로 수집한 후 UTF-8로 decode한다.
- repository text는 `encoding="utf-8"`을 명시한다.
- Windows CMD는 CRLF이며 `%~dp0..` 기준으로 root를 찾는다.
- Windows path를 URL로 바꿀 때 `pathToFileURL`을 사용한다.

### TypeScript and paths
- Node/Web ambient type 경계를 명시한다.
- target platform 경로 계산은 host OS path implementation을 사용하지 않는다.

### Test result
- Node test는 explicit TAP reporter를 사용한다.
- 성공 여부는 exit code와 OpenRill marker, TAP totals로 판정한다.
- OS별 glyph, ANSI color, 실행시간 문자열에 의존하지 않는다.

### Deterministic package
- acceptance 성공 report에는 elapsed time, PID, absolute temp path를 저장하지 않는다.
- package manifest는 acceptance 실행 전후 동일해야 한다.
- fresh ZIP extraction에서 acceptance와 manifest를 다시 검증한다.

### Migration evolution
- schema 테스트는 이전 version 배열, identity version, 다음 version 숫자를 하드코딩하지 않는다.
- expected identity, migration sequence, future version은 현재 schema 상수에서 계산한다.
- recurrence gate는 한 번 고친 표현만 찾지 않고 동일 테스트 파일의 잔여 literal을 검사한다.


### Baseline document coherence
- `README.md`, `HANDOFF.md`, `PLANS.md`, `ROADMAP.md`, `VALIDATION.md`는 current STEP/version/schema/Windows 상태/next STEP이 일치해야 한다.
- 새 ZIP만 읽어도 이전 Windows 수용과 현재 pending gate를 구분할 수 있어야 한다.

### Artifact store ownership
- Artifact store는 자신의 root directory를 직접 생성한다.
- content/metadata/sink 실패 시 partial Artifact directory를 제거한다.
- mutation이 성공한 뒤 Artifact 기록이 실패하는 경로를 fixture로 검증한다.

### Same-file mutation concurrency
- optimistic revision check와 atomic replacement 전체를 per-real-file queue로 직렬화한다.
- 같은 expected revision의 동시 write는 정확히 하나만 성공해야 한다.
- 서로 다른 파일의 mutation은 불필요하게 global serialization하지 않는다.

### Reference evidence normalization
- source line과 expected excerpt는 같은 whitespace normalization 규칙을 사용한다.
- 외부 source tree에 대한 전체 evidence verification이 현재 count와 일치해야 한다.

### Package manifest release identity
- manifest generator와 verifier는 현재 packaged STEP/version을 선언해야 한다.
- 생성된 `PACKAGE_MANIFEST.json`의 STEP/version이 root package와 current acceptance identity에 일치해야 한다.
- fresh-ZIP acceptance 후 manifest verifier를 다시 실행해 acceptance report 갱신으로 인한 hash drift가 없어야 한다.

### Synthetic secret fixtures
- live fixture credential 값은 source literal로 저장하지 않고 실행 시 cryptographic random bytes로 생성한다.
- live fixture 자체가 provider Authorization 사용과 SQLite 비저장을 실제 생성값으로 검증한다.
- acceptance는 static `secretValue` string assignment를 거부하고 runtime generation을 요구한다.

### Regression efficiency
- 전체 unit/build/architecture/export suite는 단계당 한 번 실행한다.
- 과거 acceptance를 모두 중첩하지 않는다.
- 직전 단계에서 반드시 보존해야 하는 core live fixture만 직접 실행한다.

## STEP007 이후 의무

모든 STEP plan에는 `## 반복 방지 기록`을 포함한다. 실제 실패가 발생하면:

1. `reference/validation/<STEP>_<FAILURE>.md` 작성
2. `ENGINEERING_ISSUE_REGISTRY.md` 갱신
3. 자동 recurrence gate 추가
4. acceptance에서 문서와 gate 존재 검사

## STEP008 추가 의무

File authority를 추가하거나 변경하는 STEP은 path confinement, secret/ignored policy, same-file concurrency, optimistic conflict, temp cleanup, Artifact root ownership을 자동 fixture로 유지한다.

## STEP009 추가 의무

### Typed control-flow interrupts
- Tool Runtime은 approval/cancellation 같은 Product-owned typed interrupt를 일반 Tool failure로 wrapping하지 않는다.
- Kernel만 approval interrupt를 소비해 `WAITING_APPROVAL`로 전이한다.
- 별도 Host live fixture가 wait/resolve/resume를 검증한다.

### Process output completion
- foreground process output drain은 이미 발생한 `close` event를 기다리는 raw listener에 의존하지 않는다.
- `stream/promises.finished()` 또는 동등한 state-aware completion을 사용한다.
- 빠르게 종료하는 실제 child process fixture를 유지한다.

### Additive schema and protocol evolution
- 현재 schema assertion은 `OPENRILL_STATE_SCHEMA_VERSION`에서 계산한다.
- 새 protocol capability는 이전 단계 exact list와 충돌하지 않도록 current public operation contract에서 검증한다.
- migration 추가 후 전체 기존 unit suite와 현재 STEP unit suite를 함께 실행한다.
- 이전 live fixture는 자신이 소유한 필수 Tool의 존재와 schema를 검증하되 후속 STEP의 additive Tool을 무조건 실패시키지 않는다.
- 현재 STEP acceptance는 새 public operation과 정확한 신규 Tool 등록 수를 독립 검사한다.


### Durable approval exactly-once
- PROMPT 전 process record/child는 0이어야 한다.
- resolve는 `expectedVersion`, execution은 `bindingDigest`와 atomic consume을 요구한다.
- 동일 request의 두 번째 consume은 거부한다.
- deny/cancel/expire는 durable Tool error result를 한 번만 추가하고 같은 Run을 재개한다.
- Secret 실제 값은 approval continuation, SQLite, report, package에 없어야 한다.

## STEP010 추가 의무

### Test profile isolation
- test fixture는 실제 path resolver가 지원하는 `OPENRILL_DATA_ROOT`와 `OPENRILL_CONFIG_ROOT`만 사용한다.
- `OPENRILL_HOME` 같은 미지원 변수가 test source에 남아 있으면 실패한다.
- 서로 다른 fixture가 기본 사용자 profile DB를 공유하지 않아야 한다.

### Skill source revision integrity
- `skill_sources.root_revision`은 canonical root 경로만 해시하지 않는다.
- 선택 전 manifest metadata와 validation diagnostic 변경이 revision을 바꿔야 한다.
- source revision은 시간, PID, 임시 절대경로 같은 비결정 값을 포함하지 않는다.

### Immutable Skill snapshot capture
- 동일 `runId + skillId` capture는 직렬화하며 정확히 하나의 durable snapshot만 남긴다.
- DB row 없이 남은 deterministic destination은 재사용하지 않고 제거 후 다시 만든다.
- load 시 manifest, instructions, 모든 resource의 byte count와 SHA-256을 검증한다.
- 원본 Skill 삭제 후에도 과거 Run snapshot을 읽을 수 있어야 한다.

### Pre-Kernel preparation failure
- model 호출 전 Skill discovery/capture가 실패하면 Run과 Attempt를 durable `FAILED`로 전이한다.
- terminal reason은 `SKILL_PREPARATION_FAILED`이며 model/tool call count는 0이어야 한다.
- coordinator notice만 발행하고 `CREATED` Run을 남기는 경로를 허용하지 않는다.

### Skill contract documentation coherence
- `docs/contracts/SKILLS.md`, parser top-level key set, builtin `skill.yaml`이 동일한 필드 이름을 사용해야 한다.
- OpenClaw `SKILL.md` 호환을 암시하는 예시는 금지한다.
- current STEP acceptance는 실제 builtin discovery와 snapshot을 실행한다.

### Historical acceptance secret markers
- 현재 live fixture뿐 아니라 모든 과거 acceptance와 validation source도 credential-shaped literal scan 대상이다.
- Secret 비저장 여부를 검사하는 marker 문자열 자체가 `API_KEY=` 또는 동등한 연속 credential literal을 만들지 않도록 token을 분할한다.
- 최종 ZIP 전체 text entry를 다시 스캔한다.

## STEP010R1 추가 의무

### Cross-platform filesystem capability fixtures
- Windows file symlink privilege를 요구하는 unit fixture를 acceptance 핵심 경계에 사용하지 않는다.
- directory escape는 Windows junction, POSIX directory symlink로 실제 `realpath` confinement를 검증한다.
- capability 생성 실패를 `t.skip()`으로 숨기지 않는다.
- focused Skill unit suite와 전체 suite는 `# skipped 0`을 요구한다.

### Aggregate suite predicate diagnostics
- child process exit code와 output marker/count contract를 하나의 boolean으로 계산한다.
- check outcome과 success detail은 동일한 full predicate를 사용한다.
- process exit 0이더라도 marker/count mismatch이면 실제 output tail을 report에 기록한다.
- `"suite_pass" if ok else`처럼 child exit만으로 detail을 선택하는 패턴을 금지한다.

### Compiled focused-test prerequisites
- acceptance가 시작 시 generated `dist`를 제거한다면 compiled output을 import하는 focused test 전에 workspace build를 수행한다.
- 개발 디렉터리의 잔여 dist 존재 여부에 결과가 달라지면 안 된다.
- acceptance source는 build 호출이 focused test 호출보다 앞서는지 검사한다.
- fresh-ZIP extraction에서 동일 gate를 실행한다.


## STEP010A 추가 의무

### UI framework decision coherence
- framework decision은 `config/ui-framework.json`에 한 번 기록하고 architecture marker가 이를 읽는다.
- `@openrill/web` public contract, accepted ADR, decision matrix와 config selection이 모두 같아야 한다.
- production runtime 도입 전에는 selected framework dependency가 package manifest/lockfile에 추가되지 않아야 한다.
- Local Protocol client와 framework-neutral projection에는 Vue/Lit/React/Svelte/Solid import가 없어야 한다.
- 동일 fixture/hash로 finalist source, projection, reconnect, virtualization, keyboard/accessibility 계약을 검증한다.

### Contract owner-file assertions
- static gate는 constant/type의 canonical owner file과 public re-export를 구분한다.
- barrel file에 owner literal 복제를 요구하지 않는다.
- schema version은 `packages/state/src/migrations.ts`의 declaration과 `packages/state/src/index.ts`의 export를 각각 검증한다.

## STEP010AR1 추가 의무

### Position-independent TAP failure evidence
- aggregate suite failure detail은 고정 tail slice에만 의존하지 않는다.
- 첫 `not ok` block, 대응 `# Subtest`, YAML diagnostic, final TAP counters를 보존한다.
- 실패가 10,000자보다 앞에 있어도 extractor가 실제 block을 반환해야 한다.
- 원문에 없는 failed test나 root cause를 추측하여 문서화하지 않는다.

### Deterministic unit-file concurrency
- canonical aggregate runner는 `--test-concurrency=1`을 명시한다.
- success marker는 `concurrency=1`을 포함한다.
- Host/socket/process/signal/SQLite fixture의 cross-file schedule을 Node default에 맡기지 않는다.
- 전체 suite는 `117/117`, fail 0, skipped 0을 유지한다.

## STEP011 추가 의무

### Live progress envelope coherence
- browser projection의 canonical live input은 `{runId,type,data}`이다.
- Kernel의 `model.text_delta`는 `data.delta`에서 text card로 변환한다.
- durable event row/STEP010A fixture compatibility는 명시적 별도 branch로만 유지한다.
- 실제 Kernel progress payload unit fixture와 real Host browser fixture를 모두 유지한다.
- unknown progress/notice는 삭제하지 않고 fallback card로 표시한다.

### Notice gap and replay cursor integrity
- notice cursor는 `sequence == cursor + 1`일 때만 증가한다.
- `sequence <= cursor`는 duplicate이며 projection을 변경하지 않는다.
- `sequence > cursor + 1`은 cursor를 보존하고 `RESYNC_REQUIRED`를 발생시킨다.
- server replay acceptance cursor는 client가 이미 적용한 replay base여야 한다.
- resync는 `ui.snapshot` 후 snapshot cursor로 reconnect한다.
- localStorage에는 non-secret cursor만 허용하고 token/secret/credential key를 금지한다.

### Packaged browser runtime and real vertical slice
- selected Vue runtime은 same-origin packaged file, exact version/hash/license lock을 가진다.
- CDN 또는 network fetch를 product runtime에 사용하지 않는다.
- separate Host process와 actual Chromium page가 bootstrap, Conversation send, Approval allow_once, Artifact open, reload cursor resume를 실행한다.
- mocked Vue runtime이나 static DOM smoke만으로 browser acceptance를 통과시키지 않는다.

## STEP011R1 추가 의무

### Windows live fixture handle release
- Chromium과 Host child는 `kill()` 호출만으로 종료되었다고 간주하지 않고 실제 `exit` event를 bounded wait한다.
- SQLite WAL/SHM이 포함된 temp root cleanup은 `EBUSY`, `EPERM`, `ENOTEMPTY`만 bounded retry한다.
- retry 횟수와 delay는 상수로 고정하며 무제한 retry를 금지한다.
- non-transient error는 첫 시도에서 그대로 실패한다.
- injected `EBUSY` fixture는 두 번 실패 후 성공하고 정확한 attempt/delay를 검증한다.

### Cleanup failure evidence preservation
- live fixture의 본문 실패는 `primaryFailure`로 보존한다.
- cleanup failure가 추가로 발생해도 원래 browser/ledger exception을 대체하지 않는다.
- 본문 성공 후 cleanup 실패는 acceptance 실패로 유지한다.
- cleanup-after-primary-failure는 secret/path를 포함하지 않는 bounded marker로만 stderr에 남긴다.
- direct one-shot temp-root `rm`과 unawaited child `kill()` 패턴을 STEP011 live runner에서 금지한다.

### Feature and release identity separation
- 기능 회귀 marker와 현재 package release identity를 같은 상수로 강제하지 않는다.
- STEP011 browser feature marker는 `STEP011_CONTROL_UI_VERTICAL_SLICE`를 유지한다.
- package manifest generator/verifier와 generated manifest는 현재 correction release `STEP011R1_...`를 사용한다.
- regression runner는 `STEP`과 `RELEASE_STEP`을 명시적으로 분리한다.

## STEP011R2 추가 의무

### Cross-platform Chromium executable authority
- real browser acceptance는 `/usr/bin/chromium` 또는 단일 host 경로를 직접 spawn하지 않는다.
- `OPENRILL_CHROMIUM_EXECUTABLE` override, PATH, Windows system/user Chrome·Edge·Chromium, macOS와 POSIX 표준 위치를 결정적 순서로 검사한다.
- target platform 경로를 조립할 때 `path.win32`/`path.posix`를 선택하고 current host의 default path API에 맡기지 않는다.
- browser가 없으면 mock으로 대체하지 않고 stable `OPENRILL_CHROMIUM_EXECUTABLE_NOT_FOUND`로 실패한다.
- Windows Chrome 부재/Edge 존재 fixture와 POSIX Chromium fixture를 모두 유지한다.

### Child spawn failure evidence
- browser child의 `error` event를 stdout/stderr와 별도로 즉시 수집한다.
- DevToolsActivePort polling은 captured spawn failure를 numeric exitCode보다 먼저 보고한다.
- diagnostic은 OS error code와 attempted executable을 포함한다.
- 실제 존재하지 않는 executable을 spawn하는 unit fixture가 `ENOENT`와 diagnostic capture를 검증한다.
- `Chromium exited <number>:` 뒤 빈 output만 남기는 경로를 허용하지 않는다.

## STEP011R3 추가 의무

### Pre-navigation browser instrumentation
- real Chromium starts on `about:blank`; the product URL is not passed as the initial process argument.
- Runtime, Page, Log, and Network domains are enabled before `Page.navigate`.
- runtime exceptions, error/warning console entries, failed network loads, HTTP 4xx/5xx responses, and dialogs are bounded and retained.
- instrumentation must not include bootstrap tokens, provider secrets, or private filesystem paths.

### Browser wait failure evidence
- timeout output contains `OPENRILL_BROWSER_EVIDENCE_BEGIN/END`.
- evidence includes URL, readyState, Vue version, app-shell presence, connection state, visible alert, bounded app text, script/resource metadata, and captured diagnostics.
- a synthetic early exception plus later false predicate must preserve both the exception and visible UI failure.
- `last=false` alone is not an accepted browser failure report.

### Additive aggregate suite inventory
- canonical test file 또는 test 수가 증가하면 aggregate acceptance의 expected marker를 같은 release에서 갱신한다.
- STEP011 feature acceptance는 `144/144`, `unit_files=25`, fail 0, skipped 0, concurrency 1을 검사한다.
- exact Vue vendor prerequisite가 실패해도 vendor와 무관한 build/unit/architecture/export suite는 독립적으로 실행·판정한다.
- correction acceptance는 feature acceptance source가 현재 inventory owner 값을 사용하는지 static gate로 검사한다.

### Stable failed-acceptance evidence
- prerequisite 실패는 absolute path/network stack tail 대신 stable semantic token으로 저장한다.
- actual browser 실패는 fixed tail보다 `OPENRILL_BROWSER_EVIDENCE_BEGIN/END` block을 우선 보존한다.
- repository root, temp path, loopback dynamic port와 TAP duration은 stable placeholder로 정규화한다.
- source와 fresh-ZIP에서 같은 실패 의미를 재현하면 acceptance report SHA-256이 같아야 한다.
- stable report를 위해 실제 Runtime/Network/Page 실패 종류를 삭제하거나 성공으로 바꾸지 않는다.


## STEP011R4 추가 의무

### Vue runtime-only CSP alignment
- production Control UI source는 runtime `template:`을 포함하지 않는다.
- browser source와 packaged assets에는 `eval` 또는 `new Function` 기반 template compilation 경로가 없어야 한다.
- exact Vue package에서 `vue.runtime.global.prod.js`만 추출하고 lock의 `runtimeFile`과 실제 파일명을 일치시킨다.
- CSP에 `'unsafe-eval'`을 추가해 실패를 우회하지 않는다.
- fake runtime-only Vue fixture가 실제 compiled browser module의 setup/render를 실행해 app shell을 생성한다.
- actual Chromium에서 `appShell=true`, Vue `3.5.40`, connection `CONNECTED`를 검증한다.

### Explicit browser auxiliary assets
- browser가 암묵적으로 요청하는 favicon에 의존하지 않는다.
- HTML은 packaged same-origin favicon을 명시한다.
- actual browser evidence에 favicon 404가 남으면 실패한다.

### Same-route hash reactivity
- route parameter/deep-link state는 global `location`만 읽는 dependency-free computed로 소유하지 않는다.
- 모든 `hashchange`는 reactive hash owner를 갱신한다.
- `#/approvals`에서 `#/approvals/<id>`로 같은 route 내 이동해도 selected state가 갱신되어야 한다.

## STEP011R5 추가 의무

### Approval TTL / process timeout separation
- `execution.defaultTimeoutMs`는 foreground `process.run`의 기본 child execution timeout만 소유한다.
- `execution.approvalTimeoutMs`는 pending approval의 `expiresAt` 계산만 소유한다.
- Host composition에서 두 필드를 같은 서비스 입력에 재사용하지 않는다.
- 새 필드를 생략한 기존 config는 approval timeout 120000 ms로 materialize한다.
- STEP011 actual-browser fixture는 process timeout 5000 ms와 approval TTL 120000 ms를 동시에 선언한다.
- focused gate는 old coupling expression `ApprovalService.timeoutMs <- execution.defaultTimeoutMs`의 재등장을 거부한다.
- 실제 Chromium vertical slice는 `APPROVAL_EXPIRED`가 아니라 approved process `EXITED` 결과와 final text/artifact를 검증한다.

### Vue reactive Proxy / projection serialization boundary

- `tests/unit/vue-proxy-projection-step011r6.test.mjs` must pass nested JavaScript Proxy snapshots and notices through the exported production projection.
- The copied projection must be detached from later mutation of the Proxy backing objects.
- bootstrap/protocol object graphs in `browser-app.ts` must be owned by `shallowRef`; scalar UI state may use `ref`, and the projection remains `reactive`.
- `control-ui-projection.ts` must not call `structuredClone`; projection-owned JSON-like copying is the framework boundary.
- The actual packaged Vue 3.5.40 Chromium vertical slice remains mandatory and may not be replaced by the focused test.

## STEP011R7 추가 의무

### Background child shutdown quiescence
- `ProcessManager.close()`는 Promise를 반환하고 모든 owned background child의 `close/error`와 output stream 완료를 기다린다.
- close 시작 후 새 process run은 거부한다.
- `CANCELLED`, `ORPHANED` 등 기존 terminal durable status를 delayed child close가 `EXITED`로 덮지 않는다.
- Host shutdown은 active Agent Runs를 먼저 종료하고 ProcessManager quiescence를 기다린 뒤 SQLite를 닫는다.
- STEP009 fixture cleanup은 manager close를 await하고 Windows transient tree-removal failure를 bounded retry한다.
- delayed fake-child focused fixture가 close Promise의 미완료/완료 경계를 검증한다.

### Asynchronous TAP failure evidence
- registered assertion 총수보다 하나 많은 file-path failure는 post-test asynchronous activity로 분류한다.
- correction acceptance는 file-level `not ok` 직전의 `# Error: A resource generated asynchronous activity after the test ended...` line을 함께 보존한다.
- fixed output tail만으로 해당 line을 삭제하지 않는다.

## STEP011R8 추가 의무

### Approval creation domain notice propagation
- PENDING approval의 durable insert 뒤 Kernel `approval.requested` progress는 기존 `run.event`로 계속 발행한다.
- 동일한 valid payload는 별도의 `approval.updated` domain notice도 발행한다.
- `requestId` 또는 `status`가 없는 malformed payload와 일반 progress는 `approval.updated`를 발행하지 않는다.
- Control UI는 generic `run.event`를 approval-list source로 사용하지 않고 `approval.updated`에서 `approval.list`를 재호출한다.
- actual Chromium은 initial empty list 이후 생성 notice를 받아 pending action을 렌더하고 `allow_once`를 완료해야 한다.

### Approval wait ledger evidence
- pending approval render timeout은 browser page evidence만으로 끝내지 않는다.
- stable evidence block은 provider request 수, bounded `approval_requests` rows, bounded `agent_runs` rows를 포함한다.
- token, secret, absolute private path, raw prompt를 출력하지 않는다.
- ledger read 자체가 실패하면 bounded error message를 보존하며 원래 browser failure를 대체하지 않는다.
- source/fresh-ZIP failure report는 같은 의미에서 byte-identical이어야 한다.

## Post-acceptance closure 추가 의무

### Immutable accepted artifact and baseline promotion
- external Windows에서 통과한 ZIP과 SHA는 수정하지 않는다.
- exact acceptance marker, baseline promotion, failure audit, next plan은 separate closure record에 남긴다.
- 다음 STEP source는 previous accepted artifact 이름과 exact SHA-256을 validation 문서에 포함한다.
- current README/HANDOFF/PLANS/ROADMAP/VALIDATION은 STEP011R8을 Windows-live accepted baseline으로 표시한다.
- current baseline 문서는 STEP011R8을 pending 또는 current candidate로 표현하지 않는다.
- Issue Registry OR-ISSUE-055, detailed evidence, governance rule, acceptance coherence check가 함께 존재해야 한다.

## STEP012A 추가 의무

### Automation schedule semantics
- `at`은 Z 또는 explicit numeric offset이 있는 valid RFC3339 absolute timestamp만 허용한다.
- `interval`은 anchor 기반 integer arithmetic으로 계산하며 previous execution delay를 누적하지 않는다.
- `cron`은 five-field numeric wildcard/list/range/step grammar와 explicit IANA timezone을 사용한다.
- day-of-month/day-of-week가 모두 restricted이면 Vixie OR semantics를 유지한다.
- DST spring gap은 skip하고 fall repeated wall minute는 distinct UTC occurrence 두 개로 취급한다.
- UTC, Asia/Seoul, America/New_York spring/fall fixture를 모두 실행한다.

### Automation persistence and mutation separation
- schema 8 migration은 `automation_jobs`와 `automation_runs`를 STRICT table로 생성한다.
- config update는 expected revision을 검사하고 revision을 증가시킨다.
- runtime update는 next/last schedule과 failure counter만 변경하고 revision을 증가시키지 않는다.
- `(job_id, scheduled_for)`는 database UNIQUE이고 two-worker actual SQLite fixture에서 one-winner를 증명한다.
- STEP012A package에는 timer, scheduler lifecycle, model/Conversation Run invocation, automation protocol operation, UI route가 없어야 한다.

## STEP012A nested regression inventory 추가 의무

### Historical feature runner inventory ownership
- current package의 nested STEP011 regression은 과거 고정 test count를 성공 조건으로 사용하지 않는다.
- `tests/unit/*.test.mjs`의 현재 file 수와 canonical TAP `tests == pass`, fail 0, skipped 0을 결합한다.
- STEP012A 기준 accepted floor 176보다 tests가 감소하면 실패한다.
- suite 실패 detail은 실제 `not ok`가 있을 때만 TAP failure block을 보존하고, 단순 stale expected count를 대규모 duration/PID tail로 기록하지 않는다.
- STEP012A acceptance는 nested runner source에 dynamic inventory 계산과 floor gate가 있는지 검사한다.

## STEP012A historical live schema 추가 의무

### Shared live fixtures derive current state schema
- current package에서 regression으로 재사용되는 STEP008/009/010 live fixture는 numeric schema literal을 identity assertion에 사용하지 않는다.
- 각 fixture는 built State package의 `OPENRILL_STATE_SCHEMA_VERSION`을 import한다.
- SQLite `state_identity.schema_version` assertion과 success marker가 같은 owner constant를 사용한다.
- repository scan은 active shared live fixture의 `schemaVersion !== 7`, `schemaVersion === 7`, marker `schema=7`을 거부한다.
- schema migration STEP은 unit identity gate뿐 아니라 current nested live regression을 실행한다.

## STEP012AR1 추가 의무

### Acceptance report immutability
- 일반 acceptance 실행은 manifest에 포함된 `reference/validation/*_ACCEPTANCE_REPORT.txt`를 덮어쓰지 않는다.
- current report와 nested report는 기본적으로 package 제외 경계인 `.artifacts/acceptance`와 `.artifacts/nested`에 기록한다.
- canonical candidate report 갱신은 packaging workflow의 명시적 `OPENRILL_ACCEPTANCE_REPORT_PATH` override에서만 허용하고, 갱신 뒤 manifest를 다시 생성한다.
- nested runner 전후 packaged report SHA-256이 같아야 한다.
- package manifest는 product regression 전과 후에 모두 통과해야 한다.
- verifier failure는 declared/actual count만 출력하지 않고 missing, extra, changed 수와 bounded repository-relative paths를 출력한다.
- focused fixture는 같은 파일 수에서 한 파일 내용만 변경한 경우 `changed_paths`를 보존해야 한다.
- Windows actual-browser PASS와 local prerequisite-failed report의 차이는 immutable source mutation으로 전파되지 않아야 한다.

## STEP012B 추가 의무

### Transactional due materialization and one-owner claim
- due occurrence cursor advance와 `automation_runs` insert는 같은 immediate state transaction에서 실행한다.
- materialization은 caller가 읽은 expected `next_scheduled_for`가 여전히 일치할 때만 성공한다.
- `(job_id, scheduled_for)` database UNIQUE를 우회하지 않는다.
- claim은 `PENDING` 상태만 `CLAIMED`로 전환하고 attempt를 정확히 1 증가시킨다.
- 두 SQLite connection/두 owner의 동시 claim fixture는 정확히 한 winner만 허용한다.

### Lease ownership and terminal commit
- `CLAIMED -> RUNNING`, lease renewal, terminal commit은 동일 `lease_owner`를 요구한다.
- running/renew/finish는 transition 시점에 lease가 만료되지 않았음을 검사한다.
- renewal은 status를 바꾸지 않고 lease expiry만 전진시킨다.
- terminal commit은 lease를 지우고 job `last_scheduled_for`와 failure counter를 같은 transaction에서 갱신한다.
- executor가 반환한 invalid error code나 lease loss를 성공으로 기록하지 않는다.

### Restart recovery and catch-up bounds
- startup은 expired `CLAIMED`만 `PENDING`으로 requeue한다.
- expired `RUNNING`은 재실행으로 추측하지 않고 `FAILED/AUTOMATION_INTERRUPTED_BY_RESTART`로 종결한다.
- `SKIP`은 oldest overdue occurrence의 bounded SKIPPED evidence를 남기고 future cursor로 이동한다.
- `RUN_ONCE`는 oldest overdue occurrence 하나만 실행 대상으로 materialize한다.
- `BOUNDED`는 oldest-first로 configured limit까지만 materialize하고 나머지 overdue range를 future cursor로 건너뛴다.
- catch-up loop는 unbounded backlog row를 생성하지 않는다.

### Scheduler lifecycle and Host quiescence
- Automation scheduler `close()`는 async/idempotent이며 active wake/executor 완료를 기다린다.
- close 시작 후 새 wake/run claim을 허용하지 않는다.
- Host는 Automation이 enabled인데 executor가 없으면 startup을 fail-closed한다.
- Host shutdown은 Automation scheduler quiescence를 기다린 뒤 Run/Process/SQLite를 닫는다.
- timer callback rejection은 unhandled rejection으로 유실하지 않는다.

### Explicit STEP012B boundary
- scheduler package는 Local Protocol operation, Control UI route/component, model adapter, Conversation service를 직접 import하지 않는다.
- executor는 injected interface이고 production Conversation Run composition은 STEP012C까지 deferred다.
- failure backoff/auto-disable, disable-active cancellation, public run-now, event trigger는 STEP012B 완료 조건으로 주장하지 않는다.

## STEP012B historical diagnostic identity 추가 의무

### Historical fixtures derive current package identity
- release-independent manifest diagnostic fixture는 historical STEP/version literal을 임시 manifest에 기록하지 않는다.
- fixture는 repository `PACKAGE_MANIFEST.json`의 current `step`과 `version`을 읽는다.
- current verifier identity gate를 통과한 뒤에만 changed/missing/extra path behavior를 검사한다.
- release bump 때 fixture literal을 수동 변경하는 방식은 recurrence prevention으로 인정하지 않는다.
- source gate는 fixture 내 `currentIdentity.step`, `currentIdentity.version` 사용과 release-version literal 0건을 검사한다.

## STEP012B Host readiness quiescence 추가 의무

### Host close owns readiness and metadata writes
- readiness transition은 unowned `void async` 작업으로 실행하지 않는다.
- Host는 `readinessTask`를 소유하고 close에서 cancellable readiness delay를 해제한 뒤 task settlement를 기다린다.
- READY/LISTENING/STOPPING metadata write는 `metadataWriteTail`로 직렬화하고 enqueue 시점 snapshot을 기록한다.
- metadata path 제거와 profile lock release는 readiness task와 metadata write quiescence 뒤에만 수행한다.
- close-before-ready는 `host.ready`를 명시적으로 reject하되 Host state를 FAILED로 재전환하거나 self-await deadlock을 만들지 않는다.
- focused fixture는 긴 `readyDelayMs`, due Automation execution, immediate close, readiness rejection, recursive root cleanup을 한 실행에서 검증한다.
- registered assertions보다 하나 많은 file-level TAP failure와 `host.json.*.tmp -> host.json` ENOENT가 재등장하면 실패한다.

## STEP012BR1 historical acceptance ownership 추가 의무

### Historical feature runners do not own mutable root baseline documents
- historical STEP011, STEP012AR1, STEP012B runner는 mutable root 문서의 current baseline 또는 next-cut literal을 소유하지 않는다.
- current release identity는 `RELEASE_STEP`과 `VERSION`에서 파생한다.
- STEP011 runner는 retained STEP011R8 `198/198` history와 STEP011 current-claim-zero만 검사한다.
- current release acceptance가 current candidate, accepted baseline/SHA, feature, history, next-cut coherence를 단독 소유한다. 모든 nested historical runner의 `baseline-next:`는 0건이어야 한다.
- `baseline-next:` 또는 `"STEP012_AUTOMATION_SCHEDULER" in text`가 historical STEP011 runner에 재등장하면 실패한다.
- focused test는 historical delegation, retained history, current owner, root document current identity를 4개 assertion으로 검증한다.

## STEP012C 추가 의무

### Durable manual execution identity
- `automation.run_now`는 caller-provided bounded `requestKey`를 SQLite에 저장한다.
- `request_key`는 non-null manual requests에 database unique이며 WebSocket/session memory cache로 대체하지 않는다.
- 동일 requestKey + 동일 job replay는 기존 AutomationRun을 반환한다.
- 동일 requestKey + 다른 job은 stable conflict다.
- same-millisecond manual runs는 `(job_id, scheduled_for)` unique를 우회하지 않고 collision-safe instant를 선택한다.

### Pre-execution AutomationRun and AgentRun linkage
- production executor는 Conversation submission에서 AgentRun ID를 얻은 직후 model execution 전에 `AutomationRun.run_id`를 결합한다.
- bind는 AutomationRun `RUNNING`, same lease owner, nonexpired lease를 transaction에서 검사한다.
- terminal finish는 prebound run ID를 지우지 않으며 다른 run ID로 덮지 않는다.
- lease loss, owner mismatch, terminal/unknown run binding은 fail-closed한다.

### Closed Automation protocol boundary
- 공개 operation은 `automation.create/list/get/update/run_now/history` 여섯 개다.
- top-level과 nested schedule/template/catch-up/failure-policy/patch schema는 unknown key를 거부한다.
- read/write/execute permissions를 operation registry에서 구분한다.
- Automation domain errors는 stable protocol code로 변환하며 raw SQLite error를 노출하지 않는다.
- create/update/run terminal changes는 explicit `automation.job.updated` 또는 `automation.run.updated` notice를 발행한다.

### Production Conversation executor and shutdown
- Host는 configured model providers가 있으면 production `AutomationConversationExecutor`를 구성한다.
- executor는 Conversation 생성, submission, AgentRun prebinding, approval-aware terminal wait를 한 경로로 수행한다.
- `WAITING_APPROVAL`은 Automation terminal success/failure로 오판하지 않는다.
- scheduler close는 active execution AbortSignal을 발생시키고 Conversation cancellation/coordinator settlement를 기다린 뒤 State를 닫는다.
- actual SQLite, ConversationService, scripted model, AgentRunCoordinator, Scheduler를 연결한 focused fixture가 model 실행 전 durable binding과 terminal linkage를 검사한다.

### Historical schema ownership
- STEP011 actual live fixture는 numeric current-schema literal을 사용하지 않고 built State의 `OPENRILL_STATE_SCHEMA_VERSION`을 import한다.
- active historical Python acceptance runner는 `packages/state/src/migrations.ts`에서 current `SCHEMA`를 파생한다.
- nested marker regex는 current `SCHEMA`를 interpolate하며 historical accepted evidence 문서의 schema text는 변경하지 않는다.
- repository source gate는 active STEP011 live의 `schemaVersion !== 8`, marker `schema=8`, historical runner의 `SCHEMA = 8` 재등장을 거부한다.
- STEP012C current acceptance는 exact schema 9와 migration 009를 단독 소유한다.

### Explicit STEP012C boundary
- STEP012C는 Control UI route/page/action을 추가하지 않는다.
- failure backoff/auto-disable, disable-active cancellation, event-driven trigger를 완료 범위로 주장하지 않는다.
- STEP012D가 Control UI와 actual browser Automation vertical slice를 소유한다.

## STEP012C exact vendor acquisition 추가 의무

### Bounded external prerequisite wait
- exact Vue network acquisition은 finite `VUE_DOWNLOAD_TIMEOUT_MS`와 `AbortSignal.timeout`을 사용한다.
- DNS/TCP/TLS/proxy/response wait가 acceptance를 무기한 block하지 않는다.
- timeout 또는 network failure는 `runtime_unavailable` prerequisite로 분류하며 product PASS로 바꾸지 않는다.
- integrity, archive-size, unpacked-size, exact-entry, version, license, byte-identical re-extraction gate는 그대로 유지한다.
- unit/source gate는 prior unbounded `fetch(VUE_PACKAGE_URL, { redirect, cache })` form의 재등장을 거부한다.

## STEP012C historical acceptance ownership 추가 의무

### Historical accepted-baseline documents are immutable history, not current ownership
- historical STEP012AR1 runner는 root 문서의 current accepted step, current accepted SHA, current feature를 강제하지 않는다.
- AR1 runner는 immutable AR1 step, `163/163`, STEP012A feature history, STEP011R8 history와 current-claim-zero만 유지한다.
- current accepted baseline/SHA/current feature/next-cut coherence는 current STEP012C acceptance가 단독 소유한다.
- focused source gate는 historical AR1의 `baseline-accepted-step`, `baseline-accepted-sha`, mutable `baseline-feature` 재등장을 거부한다.

### Historical deferred implementation checks use durable invariants
- historical STEP012B는 `executor: options.automationExecutor` exact syntax나 "STEP012C owns" 임시 메시지를 강제하지 않는다.
- Host가 injected executor option을 유지하고 selected executor를 scheduler에 전달하며, injected/production 둘 다 없으면 fail-closed하는지만 검사한다.
- production Conversation executor는 Host composition에만 존재하고 scheduler package의 Protocol/Conversation/model/UI 무의존 경계는 계속 강제한다.
- focused source gate는 obsolete exact composition assertion 재등장을 거부한다.

## STEP012CR1 historical browser regression ownership 추가 의무

### Backend-only releases delegate unchanged historical browser evidence
- accepted STEP012BR1 ZIP SHA와 exact Windows Chromium marker를 immutable evidence로 검증한다.
- browser-app, projection, LocalProtocolClient, index.html, app.css, favicon.svg는 accepted SHA manifest와 byte-identical이어야 한다.
- STEP011 live script는 State schema owner delta를 역정규화한 hash가 accepted BR1 live script hash와 같아야 한다.
- no-impact delegated mode는 actual Chromium 실행을 주장하지 않고 `browser_regression=ACCEPTED_BASELINE_NO_IMPACT`를 출력한다.
- direct STEP012C acceptance의 default mode는 actual historical Chromium path를 유지해 수동 진단이 가능해야 한다.
- browser surface 또는 live semantics가 변경되면 delegated gate가 fail-closed하고 STEP012D actual Chromium acceptance로 이동한다.
- STEP012D는 Automation Control UI와 actual Windows Chromium vertical slice를 단독 소유한다.

## STEP012D Automation Control UI 추가 의무

### Interval anchor preservation
- unrelated Automation edits do not recreate an interval anchor.
- unchanged `everyMs` reuses the selected job's persisted `anchorMs`.
- only new intervals or actual interval-period changes select a new anchor.
- focused source gate rejects unconditional `anchorMs: Date.now()` serialization.

### Explicit Automation UI refresh
- `automation.job.updated` reloads the canonical job list and selected detail.
- `automation.run.updated` reloads canonical history; notice payload is never treated as the full ledger.
- create/update/enable/disable/run-now/history use only the six closed STEP012C operations.
- manual replay reuses the durable request key and must leave one AutomationRun and one model execution.

### Historical browser owner cutover
- immutable STEP012BR1 browser evidence is not rewritten to current hashes.
- after STEP012D changes browser-app or CSS, the STEP012CR1 no-impact verifier must fail closed.
- historical STEP012B tests may assert scheduler-package independence but may not assert absence of current Protocol/UI features.
- STEP012D acceptance must acquire exact Vue and execute the actual Chromium Automation vertical slice.

### Actual Windows Automation vertical slice
- create, select, edit, enable, disable, run-now, durable replay, run history, reload persistence, and mobile layout execute through actual Vue 3.5.40 and Chromium.
- the ledger must contain one manual AutomationRun, one linked completed AgentRun, one model request, and no persisted provider secret.
- browser console/runtime/network evidence must be empty and cleanup must leave no DB/runtime payload in the source tree.


### Current root ownership versus immutable history
- current root README/HANDOFF/PLANS/ROADMAP/VALIDATION identify STEP012D and accepted STEP012CR1 only as current ownership claims.
- historical STEP012BR1 `187/187` and STEP011R8 `198/198` remain verified in dedicated immutable accepted-evidence documents.
- historical tests may not require old release identity in every mutable root document.

### Durable manual replay is below transport idempotency
- Automation replay reuses the same schema-9 durable `requestKey` but each UI action uses a fresh Local Protocol envelope idempotency key.
- focused source gate rejects passing `requestKey` as the third `call()` argument for `automation.run_now`.
- actual Chromium requires `RUN_REPLAYED`, exactly one manual AutomationRun, and exactly one model-provider request.


### Accepted baseline evidence is not stale current ownership
- current candidate STEP/version are positively asserted from the current release.
- immutable accepted STEP/version/SHA/marker remain required in handoff documents.
- stale-zero gates reject explicit old current-candidate claims but never reject an accepted baseline solely because its historical version is present.

## STEP012DR1 Host READY와 UI bootstrap phase 추가 의무

### Actual-browser fixtures wait for usable Host readiness
- 첫 `host.json` 존재 또는 `LISTENING` metadata를 browser launch 조건으로 사용하지 않는다.
- STEP011과 STEP012D actual-browser fixture는 shared helper로 `state=READY`, `readiness=true`, positive port를 모두 기다린다.
- child exit와 READY timeout은 마지막 metadata/read error/bounded output을 보존한다.

### Browser startup transport and projection phases remain distinct
- UI는 bootstrap fetch/parse, Protocol connect, 각 canonical projection load, READY/FAILED phase를 노출한다.
- transport가 CONNECTED인 상태의 projection 실패를 connection failure로 덮어쓰지 않는다.
- actual Chromium readiness는 `connection=CONNECTED`와 `startupPhase=READY`를 함께 요구한다.

### Startup diagnostics are bounded and secret-redacted
- browser page evidence는 `startupPhase`를 포함한다.
- STEP012D timeout은 `OPENRILL_STEP012D_STARTUP_EVIDENCE_BEGIN/END` 안에 bounded Host metadata/output, bootstrap summary, UI phase/alert를 남긴다.
- bootstrap token, provider credential, raw workspace payload는 evidence에 포함하지 않는다.
- OR-ISSUE-072 detail, Registry row, focused tests, acceptance static gate가 함께 존재해야 한다.

### Corrective release identity is separate from retained feature identity
- current release step/version is derived from `PACKAGE_MANIFEST.json`, not hardcoded to the feature STEP.
- root documents contain both the current corrective release and retained `STEP012D_AUTOMATION_CONTROL_UI_WINDOWS_VERTICAL_SLICE` feature identity.
- historical accepted evidence remains dedicated and is not rewritten as current ownership.
- active historical runners that validate package identity use the current corrective release identity.
- OR-ISSUE-073 detail and dynamic manifest-based unit gate are mandatory.


### Vue vendor build and static serving alignment
- exact Vue acquisition 성공만으로 actual browser readiness를 선언하지 않는다.
- acceptance는 acquired vendor 경로를 `OPENRILL_VUE_RUNTIME_VENDOR_DIR`로 전달한 vendor-aware workspace build를 Chromium live 전에 실행한다.
- `apps/agent-web/dist/public/vendor`의 runtime, lock, license는 acquired vendor와 byte-identical이어야 한다.
- actual-browser fixture는 Chromium 시작 전에 Host HTTP `/vendor/vue.runtime.global.prod.js`와 lock을 조회하고 status/MIME/bytes/SHA를 검증한다.
- 404, MIME mismatch, byte/hash drift는 `OPENRILL_VUE_STATIC_EVIDENCE_BEGIN/END`로 bounded evidence를 보존한다.
- OR-ISSUE-074 detail, Registry row, focused 4/4, static source gate, Windows browser gate가 함께 존재해야 한다.

### STEP012DR2 Vue vendor build/static serving 추가 의무
- current release는 `STEP012DR2_VUE_VENDOR_BUILD_AND_STATIC_SERVING_ALIGNMENT`와 version `0.12.8-step012dr2`를 소유한다.
- retained STEP012D feature와 accepted STEP012CR1 evidence는 별도 경계로 유지한다.
- vendor-aware build가 live 실행보다 선행하고 served bytes가 acquired bytes와 동일해야 한다.

## STEP012DR3 background process output observation 추가 의무

### Background stdout readiness is observed, not slept
- `ProcessManager.run(background=true)` 반환을 첫 stdout flush 완료로 해석하지 않는다.
- background output test는 fixed `100ms` sleep을 사용하지 않고 bounded polling을 사용한다.
- fixture는 첫 stdout을 250ms 지연해 과거 fixed-sleep 가정을 결정적으로 깨뜨린다.
- polling은 process가 `STARTING/RUNNING`인지 확인하고 timeout 시 final status와 final tail을 보존한다.
- cancel 후 durable `CANCELLED` assertion에는 추가 timing sleep을 사용하지 않는다.
- OR-ISSUE-075 detail, Registry row, focused STEP009 12/12, DR3 static 4/4, canonical repeated gate, Windows full acceptance가 함께 존재해야 한다.

### STEP012DR3 current release ownership
- current release는 `STEP012DR3_BACKGROUND_PROCESS_OUTPUT_OBSERVATION_ALIGNMENT`와 version `0.12.9-step012dr3`를 소유한다.
- retained STEP012D feature, DR2 vendor/static-serving correction history, accepted STEP012CR1 evidence는 별도 경계로 유지한다.

## STEP012DR4 Automation history selector isolation 추가 의무

### Action and history-row testids use non-overlapping namespaces
- `automation-run-now` action은 유지하되 history row는 `automation-history-row-<automationRunId>` 전용 namespace를 사용한다.
- actual Chromium은 `[data-testid^="automation-history-row-"]`만 첫 run/replay row count에 사용한다.
- broad `[data-testid^="automation-run-"]` selector는 live fixture에 0건이어야 한다.
- DOM one-row gate와 SQLite `automation_runs` exact-one/provider request exact-one gate를 독립적으로 유지한다.
- OR-ISSUE-076 detail, Registry row, focused 4/4, canonical suite, Windows actual Chromium final marker가 함께 존재해야 한다.

### STEP012DR4 current release ownership
- current release는 `STEP012DR4_AUTOMATION_HISTORY_ROW_SELECTOR_ISOLATION`과 version `0.12.10-step012dr4`를 소유한다.
- retained STEP012D feature, DR1 READY/phased startup, DR2 vendor/static alignment, DR3 bounded process observation, accepted STEP012CR1 evidence는 별도 경계로 유지한다.

## STEP013A Browser Runtime lifecycle and policy foundation 추가 의무

### Accepted STEP012DR4 closure ownership
- official accepted baseline is `STEP012DR4_AUTOMATION_HISTORY_ROW_SELECTOR_ISOLATION`, Windows `180/180`.
- immutable accepted ZIP SHA-256 is `46097b9ec753b46741705823a5a9a67ab191d6fe3350db43f64e43b516807658`.
- exact accepted marker is retained in `STEP012DR4_WINDOWS_LIVE_ACCEPTED.md` and the accepted ZIP is never rewritten.

### OpenClaw reference is evidence, not a product dependency
- the OpenClaw reference ZIP SHA and exact inspected source-file hashes are recorded.
- STEP013A documents adopted contracts and deliberate differences.
- architecture and package scans reject `openclaw` or `@openclaw/*` dependencies/imports.
- no copied OpenClaw runtime source is packaged as OpenRill product code.

### Browser actor ownership and generation safety
- each Browser session is bound to `workspaceId + conversationId + runId + attemptId`.
- Browser launch is single-flight and every context is isolated with persistent storage/downloads disabled.
- disconnect increments the generation and stale session/page handles fail closed.
- Run cancellation closes only sessions owned by that Run.
- max session and page limits are checked before actor creation.

### Browser navigation policy
- only `http:`, `https:`, and exact `about:blank` are accepted.
- URL-embedded credentials are rejected without echoing the credential.
- private/loopback addresses are denied by default unless the hostname/IP is explicitly allowlisted or private-network policy is enabled.
- DNS results and final post-navigation URL are both checked.
- popups are closed and downloads cancelled at the runtime boundary.

### Bounded operations and shutdown quiescence
- launch/action timeouts race the adapter Promise and remain event-loop referenced while awaited.
- an adapter that ignores AbortSignal must still produce `BROWSER_LAUNCH_TIMEOUT`.
- close marks runtime `CLOSING` before its first await, rejects new work, waits admitted operations, attempts every page/context/browser/driver cleanup, and preserves the first cleanup error.
- Host waits for Browser and Process drains before closing SQLite.
- shutdown tests synchronize with explicit lifecycle barriers, never fixed sleeps or generic event-loop turns.

### Configuration and release identity
- Browser config is closed, bounded, disabled/headless by default, and contains no persistent-profile or download path.
- `browser.enabled` without a Browser driver fails before profile lock acquisition.
- every current manifest, `src/index.ts` package identity, Host metadata literal, and Skill snapshot runtime literal matches `0.13.0-step013a`.
- historical release literals remain only in historical acceptance/evidence owners.

### STEP013A scope boundary
- no public Browser Tool is registered.
- no Browser protocol operation is exposed.
- no state migration or durable Browser ledger is added; schema remains 9.
- no Playwright dependency or concrete executable adapter is added.
- STEP013B owns concrete adapter and Browser Tool publication after STEP013A acceptance.

### Historical Host fixtures follow additive materialized config and drain ownership
- manual materialized Host configs include the required disabled/default `browser` section.
- shutdown source gates require Run coordinator close, then BrowserRuntime and ProcessManager drain in one awaited `Promise.allSettled`, then SQLite close.
- OR-ISSUE-081 detail and the full serial canonical suite are mandatory.

### Latest accepted baseline and immutable historical evidence are separate
- mutable root documents own the current manifest identity and latest accepted STEP012DR4 marker/SHA only.
- superseded STEP012D/STEP012CR1/STEP012BR1/STEP011 markers are checked in dedicated immutable evidence files.
- accepted-baseline promotions must not be rejected by a frozen historical root assertion.
- OR-ISSUE-082 detail and manifest-dynamic historical test are mandatory.

## STEP013AR1 workspace lock importer alignment 추가 의무

### Workspace manifests and lock importers are one exact dependency graph
- root 포함 26개 workspace package의 `dependencies`, `devDependencies`, `optionalDependencies` key 집합은 대응 `pnpm-lock.yaml` importer와 정확히 동일해야 한다.
- `services/agent-host` importer는 `@openrill/browser-runtime -> link:../../packages/browser-runtime`를 포함해야 한다.
- dependency 추가 후 lock importer를 갱신하지 않은 package는 manifest 생성 전에 실패해야 한다.
- negative fixture는 누락된 dependency 이름과 importer 경로를 bounded evidence로 출력해야 한다.

### pnpm run must not mutate packaged source
- `pnpm-workspace.yaml`은 `verifyDepsBeforeRun: error`를 소유한다.
- dependency install은 `pnpm install --frozen-lockfile` 명시적 단계로 분리한다.
- `pnpm acceptance:*`는 implicit install로 lockfile이나 package source를 변경해서는 안 된다.
- initial/final package manifest 모두 `changed=0`이어야 한다.

### OR-ISSUE-083 closure
- detail document, Registry row, exact-importer verifier, focused 3/3, canonical suite, fresh-ZIP acceptance, Windows final marker가 함께 존재해야 한다.

## STEP013AR1 corrective identity and validation-workspace isolation 추가 의무

### Retained feature and current release identity are separate
- STEP013A Browser feature assertions remain retained.
- current package/source/Host version is derived from the root manifest and may be STEP013AR1 or a later corrective release.
- original STEP013A version literals must not be used as current-identity assertions.
- OR-ISSUE-084 detail and dynamic boundary test are mandatory.

### Workspace module links may not cross validation roots
- every materialized `node_modules/@openrill/*` link or junction resolves inside the current validation root.
- copied/fresh worktrees never inherit absolute workspace links from another source root.
- cross-root links fail before focused/canonical execution with package-name-only bounded evidence.
- OR-ISSUE-085 detail, module-link verifier, focused gate, and fresh-ZIP acceptance are mandatory.

## STEP013AR2 workspace module link layout alignment 추가 의무

### Physical root scope is not the dependency-resolution contract
- root `node_modules/@openrill`은 optional이며 존재 여부만으로 pass/fail하지 않는다.
- 모든 workspace package가 선언한 내부 dependency는 importer의 Node ancestor lookup에서 current source root의 정확한 workspace package로 해석돼야 한다.
- package-local pnpm symlink/junction layout과 root-hoisted validation layout을 모두 허용한다.
- missing, outside-root, wrong-target은 importer/dependency 이름만 포함한 bounded evidence로 실패한다.
- root-scope-absent positive fixture와 outside-root negative fixture가 필수다.
- OR-ISSUE-086 detail, focused 2/2, canonical skipped-zero, fresh-ZIP acceptance가 함께 존재해야 한다.

### Successful workspace-link evidence is layout-neutral
- successful aggregate detail is exactly `workspace_module_links_pass` regardless of root-hoisted or package-local pnpm layout.
- failure reports retain full bounded verifier evidence.
- source root-scope-present and fresh root-scope-absent acceptance reports must be byte-identical.
- OR-ISSUE-087 detail and focused static gate are mandatory.

## STEP013AR3 acceptance stage liveness 추가 의무

### Every external acceptance child is visible and bounded
- aggregate는 child 시작 전에 flushed `OPENRILL_ACCEPTANCE_STAGE_START`를 출력한다.
- 15초 이상 실행되는 child는 heartbeat를 출력한다.
- 모든 external stage는 명시적 timeout을 소유한다.
- timeout 시 Windows child tree는 bounded `taskkill /T /F`, POSIX child group은 TERM/KILL로 종료한다.
- timeout evidence에는 stage, bound, termination result가 포함된다.
- aggregate script는 직접적인 unbounded `subprocess.run` 또는 `subprocess.Popen`을 사용하지 않는다.
- cleanup은 scan 전에 start marker를 출력하며 excluded trees를 순회하지 않는다.
- OR-ISSUE-088 detail과 non-terminating child focused fixture가 필수다.

## STEP013AR4 stage-runner fixture import isolation 추가 의무

### Timeout fixtures do not depend on implicit Python import paths
- stage-runner fixture는 `python -c`의 cwd 또는 namespace-package import에 의존하지 않는다.
- helper는 exact absolute file identity와 `importlib.util.spec_from_file_location`으로 로드한다.
- module execution 전 `sys.modules`에 등록한다.
- fixture는 unrelated temporary cwd, Python `-P`, `PYTHONSAFEPATH=1`에서도 실제 30초 child를 0.4초 bound로 종료해야 한다.
- `from scripts.acceptance_stage_runner import run_stage` 패턴은 recurrence gate가 거부한다.
- OR-ISSUE-089 detail, focused 4/4 + 2/2, canonical skipped-zero, fresh-ZIP acceptance가 함께 존재해야 한다.

## STEP013B1 Playwright adapter and observation 추가 의무

### Concrete adapter metadata never widens the provider-neutral contract
- `BrowserDriver` contains no executable-discovery metadata and `browser-runtime` has no Playwright dependency.
- Host reads resolved executable metadata from a concrete `PlaywrightBrowserDriver` local before assigning it to `BrowserDriver`.
- `resolvedBrowserDriver.executable` or equivalent interface leakage is rejected.
- OR-ISSUE-090 detail, static boundary test, and TypeScript project build are mandatory.

### Process ownership retirement is lifecycle-owned
- normal close and unexpected disconnect both remove the same process handle exactly once.
- retirement is idempotent and executes in normal-close `finally`.
- adapter live evidence reports `activeProcessCount=0` before completion.
- OR-ISSUE-091 detail and static/live process-retirement gates are mandatory.

### Abort does not abandon a late Browser launch
- the original `chromium.launch()` Promise remains observed after an abort race.
- any Browser resolving after abort is closed immediately.
- a boundary race after launch resolution rechecks the signal and closes before returning a handle.
- acceptance uses a unique Chromium command-line marker and requires process-table orphan count zero.
- OR-ISSUE-092 detail, static cleanup gate, and live orphan-zero gate are mandatory.

### STEP013B1 surface remains read-only and closed
- the only public Browser tools are `browser.status/open/list/navigate/snapshot/close`.
- every Tool input schema is closed with `additionalProperties:false`.
- Browser protocol operations and durable Browser ledger remain zero; state schema remains 9.
- snapshot refs are document-generation scoped and stale refs fail with `BROWSER_STALE_REF` after main-frame navigation.
- click/type/fill/select/press/wait/evaluate and artifact-producing Browser actions remain deferred.

### Latest accepted baseline promotion does not rewrite history
- mutable root documents own the current candidate and latest accepted baseline.
- older accepted identities remain in dedicated immutable evidence files.
- a historical ownership test may not freeze a superseded baseline as the permanent latest baseline.
- OR-ISSUE-093 detail and canonical root/history scope gate are mandatory.

### Workspace inventory counts are derived
- lock alignment tests derive current manifest inventory from the workspace tree.
- exact dependency-set verification remains authoritative; numeric counts are diagnostics, not frozen contracts.
- adding or removing a valid workspace package requires a matching lock importer but no literal test-count edit.
- OR-ISSUE-094 detail and positive/negative lock alignment gates are mandatory.

### Provider-neutral launch errors preserve actionable adapter diagnostics
- the public error code remains `BROWSER_LAUNCH_FAILED` for unknown concrete adapters.
- a safe adapter string code and message are retained in BrowserRuntime failure detail and Tool output.
- provider-neutral runtime does not import or branch on Playwright error classes.
- OR-ISSUE-095 detail and missing-Playwright focused fixture are mandatory.


## STEP013B1A deterministic focused reporter gates

### OR-ISSUE-096 — explicit reporter ownership
- Any active acceptance command whose predicate parses `# tests`, `# pass`, `# fail`, `# cancelled`, or `# skipped` must invoke Node with `--test-reporter=tap`.
- STEP013B1 and STEP013B1A Browser focused commands are both scanned so the broken predecessor path cannot silently remain callable.
- Passing subtests printed as Windows `✔` / `ℹ tests` must never be classified as product failures.
- `tests/unit/focused-test-reporter-step013b1a.test.mjs` and the aggregate `tap-reporter-*` checks are mandatory.

### OR-ISSUE-097 — nested standalone Node test context
- A test that validates standalone `node --test` stdout from inside another Node test must remove inherited `NODE_TEST_CONTEXT` from the child only.
- It must retain shell=false, UTF-8 capture, no-color settings, and assert exit 0 plus TAP totals.
- Empty stdout under inherited `NODE_TEST_CONTEXT=child-v8` is a fixture-context defect, not evidence that the child test failed.


## STEP013B2 Browser interaction gates

### OR-ISSUE-098 — historical additive capability ownership
- Historical STEP013B1 tests and STEP013B1/B1A runners must verify the retained six-tool prefix/subset, never the total current Browser Tool inventory.
- STEP013B2 alone owns the exact 12-tool list.
- The static boundary test must inspect both historical tests and both historical runners.

### OR-ISSUE-099 — actionable ref boundary
- BrowserRuntime and Tool packages must have zero Playwright/Puppeteer dependency.
- The concrete adapter must derive opaque IDs from Playwright AI aria snapshot refs and build `aria-ref=` locators internally.
- Public refs remain document-generation scoped and adapter IDs never cross the Tool output boundary.

### OR-ISSUE-100 — action navigation policy
- Every top-level action navigation request must call the provider-neutral guard before network dispatch.
- A denied route must retain the original typed `BROWSER_NAVIGATION_BLOCKED` error rather than collapse to a generic Playwright network error.
- BrowserRuntime must recheck the final URL after action completion.
- The deterministic live fixture must exercise a denied destination.

### OR-ISSUE-101 — dialog blocker
- Modal dialog observation and safe dismiss belong to the concrete adapter.
- A dialog-opening action must return `BROWSER_DIALOG_BLOCKED` with bounded observation state, never success or a bare timeout.
- No accept/respond Tool is introduced in STEP013B2.
- A later explicit action must succeed after safe dismissal.


### OR-ISSUE-102 — historical current-version ownership
- Historical feature/command tests must not require the mutable root package version to equal their own release version.
- Historical STEP/version identity belongs in dedicated immutable plan/report evidence.
- Current manifest/source/Host version alignment belongs only to the current release verifier.
- STEP013B2 boundary tests scan the retained reporter test for the broken assertion.


### OR-ISSUE-103 — canonical current accepted baseline owner
- `config/current-accepted-baseline.json` is the only machine-readable mutable owner of accepted step/version/checks/ZIP SHA/evidence.
- Historical tests must load that record; they may not embed the latest accepted STEP, check count, or SHA.
- Every mutable root document must match both current release identity and the canonical accepted-baseline record.
- The referenced evidence must exist and identify the accepted step.


### OR-ISSUE-104 — complete stage failure evidence
- Every STEP013B2 external stage writes its complete UTF-8 stdout/stderr capture to `.artifacts/acceptance/STEP013B2_STAGES/<stage>.log`.
- A failed long TAP stage must retain early `not ok` blocks, assertion/error diagnostics, nonzero `# fail`, and the full-stage-log path in a bounded report excerpt.
- The aggregate must not store a raw output tail as the only diagnostic and must not apply a second tail truncation while printing failures.
- `tests/unit/acceptance-stage-evidence-step013b2.test.mjs` must prove byte-exact full-log persistence using an early synthetic failure followed by more than 20 KB of later output.
- A non-reproduced underlying test failure is not assigned a guessed cause; the preserved full log is mandatory for the next occurrence.


## STEP013B3 Browser Artifact and evidence gates

### OR-ISSUE-105 — historical schema and inventory ownership
- historical Browser tests assert only their owned minimum schema and retained Tool prefix/subset;
- STEP013B3 alone owns exact schema 10, migration 010, and the 15-tool inventory;
- adding a later migration or Browser Tool must not require rewriting historical accepted identities.

### OR-ISSUE-106 — legacy Artifact response stability
- `recordRead`, `recordSearch`, and `recordChange` explicitly return only `{artifactId, kind}`;
- existing workspace Tool tests retain exact deep-equality assertions;
- Browser Artifact methods may return richer references only under Browser Tool contracts.

### OR-ISSUE-107 — reserved download filenames
- sanitized download names may not equal `source.json` or `metadata.json`;
- reserved names are deterministically prefixed with `download-`;
- the focused fixture verifies exact downloaded bytes and separate source/control metadata files.

### OR-ISSUE-108 — composable output bounds
- default Browser payload bounds remain below the generic Artifact total by an explicit metadata envelope;
- Playwright page titles are bounded to 4,096 characters before `title()`, snapshot, or screenshot metadata crosses the adapter boundary;
- screenshot/download overflow returns `BROWSER_OUTPUT_TOO_LARGE` before metadata commit;
- focused and real-browser fixtures verify zero metadata growth on an oversized download.

### Browser evidence privacy and boundedness
- evidence is page-local, cursor-based, and bounded to configured public batches and a 200-event adapter ring;
- network URL credentials/fragments are removed and query strings become `?redacted`;
- request headers/bodies, response bodies, cookies, and authentication material are not collected;
- screenshot is viewport-only and download has no caller path/directory input.


## STEP013C Automation Browser and restart gates

### OR-ISSUE-109 — historical ownership remains additive
- retained STEP013B3 tests own migration 010, minimum schema 10, and the 15 accepted Browser Tool names;
- STEP013C alone owns exact schema 11 and migration 011;
- helper-based Tool registration or later schema additions must not rewrite historical accepted identity.

### OR-ISSUE-110 — safe checkpoint suffix classification
- recovery searches for the latest `run.checkpoint`;
- only `model.requested` and `model.retry` may follow it for automatic resume;
- partial model text/reasoning/Tool-call output after the checkpoint is non-resumable.

### OR-ISSUE-111 — model invocation restart closure
- every STARTED model invocation belonging to an incomplete Run is terminalized during restart classification;
- terminal status is FAILED with `MODEL_INTERRUPTED_BY_RESTART` and a non-null end time;
- later request numbering must preserve the interrupted request row.

### OR-ISSUE-112 — dedicated evidence persistence privacy
- raw Browser Tool input never enters Browser operation/evidence tables;
- console/page-error/failure strings are persisted only as SHA-256 plus length;
- network URLs are sanitized again at the persistence boundary;
- a focused fixture must prove inserted raw text is absent from persisted evidence JSON.

### Autonomous two-Host live gate
- Host child 1 is force-killed after a completed Browser Tool checkpoint and during the next model request;
- Host child 2 must reclaim the same Automation Run and Agent Run, reject the old Browser session, explicitly reopen, create a screenshot Artifact, persist bounded evidence, and complete;
- final marker requires `process_count=0 chromium_orphan=0`.

### OR-ISSUE-113 — complete mutable accepted-baseline identity
- every mutable root continuation document (`README.md`, `HANDOFF.md`, `PLANS.md`, `ROADMAP.md`, `VALIDATION.md`) must contain the current candidate STEP/version and the canonical accepted step/checks/ZIP SHA;
- values are loaded from `config/current-accepted-baseline.json`; historical tests may not embed the latest accepted literal;
- omission of the accepted aggregate count is a handoff-integrity failure even when step and SHA are present.

### OR-ISSUE-114 — recovered attempt pointer continuity

- `recoverIncompleteRuns()` must retain the interrupted attempt ID while changing that attempt to `ABORTED/HOST_RESTART`;
- recovery code may not assign `currentAttemptId = null` for this transition;
- a focused fixture must call the real `executeAgentRun()` after recovery and require the same Run to complete with a distinct attempt 2;
- the old attempt must remain ABORTED and must never return to RUNNING.

### OR-ISSUE-115 — typed and preserved recovery failure evidence

- `ConversationError` crossing `AutomationConversationExecutor` must produce `AUTOMATION_CONVERSATION_<CODE>` rather than the generic executor code;
- the two-Host live fixture must emit `OPENRILL_STEP013CR1_RECOVERY_DIAGNOSTICS` before a failed terminal assertion and cleanup;
- the diagnostic payload may include only bounded status, attempt, event type, invocation, and Browser operation metadata—never prompts, Tool arguments, page text, evidence text, headers, bodies, cookies, or raw URLs;
- the acceptance runner must persist the complete stage log before generating a bounded failure excerpt.

### OR-ISSUE-116 — historical recovery tests own behavior, not null-pointer representation

- canonical recovery tests must require `CREATED/RESUMABLE`, an attached `ABORTED/HOST_RESTART` attempt, and a distinct next attempt;
- no historical test may require `currentAttemptId === null` for a resumable interrupted Run;
- the old ABORTED attempt may never be changed back to RUNNING.

### OR-ISSUE-117 — live acceptance diagnostics are metadata-only

- Browser live fixtures may not query or print `conversation_messages.content_json` for failure diagnostics;
- pre-crash ledger diagnostics are limited to Tool name, terminal status, and typed error code;
- terminal recovery diagnostics are limited to Automation/Run/attempt/event/invocation/Browser-operation metadata;
- acceptance stage logs may preserve complete output only after these source-level privacy gates pass.

### OR-ISSUE-118 — SQLite rows are value contracts, not prototype contracts

- live acceptance may not compare a `node:sqlite` row directly to an ordinary object literal with deep equality;
- the interrupted invocation check must require row existence and exact `status=FAILED` plus `errorCode=MODEL_INTERRUPTED_BY_RESTART`;
- an `Object.create(null)` row with those fields must pass while missing or incorrect fields fail;
- the Windows STEP013CR1 null-prototype failure evidence remains packaged.

### OR-ISSUE-119 — every external acceptance stage owns a timeout

- `focused-sqlite-row-assertion` must be present in both the stage list and `STAGE_TIMEOUTS`;
- its timeout is bounded to 120 seconds;
- adding a focused stage without timeout inventory is an acceptance-runner failure even when the underlying tests pass.

### OR-ISSUE-120 — acceptance predicates follow current owners

- model interruption ownership is checked in `recovery-live-assertions.mjs`;
- TAP reporter ownership requires a matching external stage command line, not the first substring occurrence;
- the retained STEP013B1A reporter suite remains exactly 4 tests;
- the STEP013CR2 null-prototype suite owns its own exact count.

### OR-ISSUE-121 — package identity is current, accepted identity is separate

- `PACKAGE_MANIFEST.json`, its generator, and its verifier must use the current root STEP/version;
- `config/current-accepted-baseline.json` remains the sole owner of the last Windows-live-accepted STEP/checks/SHA;
- a candidate ZIP may not label itself with the accepted baseline merely because acceptance is pending.

### OR-ISSUE-122 — observed usage evidence survives ceiling overshoot

- migration 012 may constrain usage to non-negative values but may not constrain observed usage to configured ceilings;
- a provider turn reporting more total tokens than the remaining ceiling must persist exact actual usage;
- the Run must terminate with `AGENT_TOTAL_TOKEN_BUDGET_EXCEEDED`, not a SQLite error;
- package and boundary gates reject any reintroduction of usage-versus-limit SQL CHECKs.

### OR-ISSUE-123 — cumulative turns are summed across attempts

- each attempt owns its own `used_turns` count;
- Run-wide aggregation and aggregation excluding the current attempt both use SUM;
- two attempts with one turn each must produce cumulative turns `2`;
- restart cannot reset or under-count `maxTurns` enforcement.

### OR-ISSUE-124 — historical gates do not own current release identity

- STEP013C owns migration 011 and the Browser ledger contract, not an eternal global schema value 11;
- STEP013CR2 owns prototype-neutral assertions, not the current package STEP/version;
- STEP014A alone requires exact current schema 12 and package identity.

### OR-ISSUE-125 — execution budget runtime normalization

- `ConversationService.startExecution()` accepts the retained pre-STEP014A runtime shape;
- missing `maxTotalTokens` becomes 65,536 and missing `maxDurationMs` becomes 15 minutes;
- normalized values are identical in attempt, budget envelope, and start event;
- no undefined value may reach SQLite binding.

### OR-ISSUE-126 — one durable deadline clock domain

- durable deadline creation and Kernel comparison use the Conversation-owned clock unless an explicit Kernel clock is supplied;
- deterministic-clock Automation/recovery tests must not depend on process epoch time;
- wall-clock budget expiry remains enforced when the shared clock reaches the deadline.

### OR-ISSUE-127 — acceptance predicates derive real source inventory

- STEP014A acceptance may not name the nonexistent `packages/tool-runtime/src/registry.ts`;
- Tool Runtime source inspection enumerates the actual package `src/*.ts` inventory;
- every statically named repository file consumed by the runner must exist before aggregate execution.

### OR-ISSUE-128 — canonical tests are explicit subprocess arguments

- direct acceptance subprocess commands may not depend on shell wildcard expansion;
- STEP014A resolves and sorts every `tests/unit/*.test.mjs` path before stage construction;
- the canonical stage receives each file as an independent argument and retains exact TAP inventory verification.

### OR-ISSUE-129 — usage is durable before reservation
- model token usage is persisted after each turn;
- Tool count is persisted before Tool execution;
- child reservation reads only durable parent usage and active reservations.

### OR-ISSUE-130 — child budget envelope is authoritative
- a delegated Run uses its existing `run_budget_envelopes` row;
- execution budget drift fails with `DELEGATION_BUDGET_CONFLICT`.

### OR-ISSUE-131 — child Tool scope is enforced twice
- only allowed Tool schemas reach the child model;
- forged or stale out-of-scope calls fail with `AGENT_TOOL_NOT_ALLOWED` before dispatch.

### OR-ISSUE-132 — result delivery is exactly once
- `run_delegation_result_deliveries` owns delegation, attempt and Tool-call identity;
- one child terminal result creates one Tool message, one completion event, and one checkpoint;
- replay verifies the result hash and creates no duplicate.

### OR-ISSUE-133 — historical stages do not freeze current delegation surface
- STEP014A owns migration 012 and its no-public-Tool decision at that time;
- STEP014B owns exact schema 13 and `agent.spawn`/`agent.wait`.

### OR-ISSUE-134 — child Skill scope does not expand
- delegated Runs skip automatic Skill activation in STEP014B;
- the child system instruction branch is selected from durable `parentRunId`.

### OR-ISSUE-135 — terminal/wait race is closed
- terminal child before wait returns its bounded result immediately;
- active child registration durably pauses the parent;
- terminal transition during registration is re-read, not surfaced as a Tool error.

### OR-ISSUE-136 — every new workspace is in the clean build graph
- root `tsconfig.build.json` references `packages/tools-delegation` before `services/agent-host`;
- Host manifest and lock importer retain the workspace dependency;
- acceptance deletes all package `dist` directories before the focused build;
- a build that succeeds only with stale output is not acceptable.

### OR-ISSUE-137 — retained schema ownership is additive
- STEP014B verifies migration 013 and schema >=13;
- STEP014C alone owns exact schema 14.

### OR-ISSUE-138 — parent budgets include descendants
- completed child own plus descendant use increments parent delegated counters;
- Kernel checks own plus delegated turns, tokens, model calls and Tool calls.

### OR-ISSUE-139 — reservation release is exactly once
- each delegation has one durable reservation;
- only RESERVED may transition to RELEASED;
- replay must match exact charge and reason;
- parent increments only on the first release.

### OR-ISSUE-140 — nested authority remains inherited and bounded
- `maxNestedDepth` cannot exceed the durable parent depth;
- delegation Tools are derived, not caller-injected through `toolNames`;
- depth 3 fails under the default depth-2 envelope.

### OR-ISSUE-141 — cancellation owns all descendants
- cancellation order is deepest-first;
- approval, process, Browser and coordinator resources are cancelled before child terminalization;
- replay does not duplicate usage charge.

### OR-ISSUE-142 — child deadlines are terminal
- expired active child Runs are discovered from durable deadlines;
- timeout uses `TIMED_OUT` plus `DELEGATION_TIMEOUT` and exactly-once parent delivery.

### OR-ISSUE-143 — terminal delivery survives restart
- startup reconciles terminal child Runs with active or pending delivery;
- one Tool result and checkpoint are persisted across replay.

### OR-ISSUE-144 — runnable children resume after restart
- startup schedules durable CREATED delegated Runs;
- a child with `WAITING_DELEGATION` is excluded until its descendant resolves.

### OR-ISSUE-145 — joined status columns are qualified
- terminal and timeout queries select delegation columns through an explicit `d.` projection;
- SQLite reopen/reconciliation tests execute the joined queries.

### OR-ISSUE-146 — historical exclusions do not own the current surface
- STEP014B/C tests preserve their plan-time exclusions only;
- STEP014D owns exact current `delegation.list/get/cancel` and UI route.

### OR-ISSUE-147 — mutable release identity has one current owner
- current manifest/source verifiers match the root package version and STEP014D identity;
- retained STEP014C identity is checked only in its immutable plan.

### OR-ISSUE-148 — delegated-work control projection is privacy-safe
- no task/hash, transcript, reasoning, Tool/provider/event payload crosses Protocol;
- event metadata is capped at 100 and terminal result bounds are retained.

### OR-ISSUE-149 — operator cancellation reuses subtree ownership
- cancellation is deepest-first and cleans Approval, Process, Browser and coordinator resources;
- terminal replay performs no mutation or duplicate event.

### OR-ISSUE-150 — UI ordering follows durable relations
- roots/children are derived from parentRunId/childRunId;
- render traversal has a seen guard and depth markers.

### OR-ISSUE-151 — live UI is executed, not source-inspected only
- Windows live opens the served application in Chromium;
- delegation navigation, depth-2 tree and bounded detail must render;
- success requires chromium_orphan=0.

### OR-ISSUE-152 — external model identity is explicit
- live requires OPENAI_API_KEY and OPENRILL_STEP014D_MODEL;
- no hardcoded/default model is accepted.

### OR-ISSUE-153 — historical UI tests do not freeze route adjacency
- retained Automation tests verify route/operations/notices/actions, not current array prefix;
- STEP014D owns the current Delegated work navigation position.

### OR-ISSUE-154 — current Protocol capability inventory is additive and exact
- handshake retains all prior operations and exactly three delegation operations;
- Protocol version remains 1.

### OR-ISSUE-155 — all runtime version literals align
- every package/source/Host bootstrap identity equals the root package version;
- dedicated verifier fails on any stale Host literal.

### OR-ISSUE-156 — acceptance predicates follow semantic owners
- list validation checks the exact conflict owner and 1..200 bound;
- tree validation checks parent indexing, root detection and childRunId traversal;
- equivalent implementation is not rejected by invented syntax.


### OR-ISSUE-157 — release archives remain outside source root
- root-level `openrill-step*.zip` and checksum companions fail before package-manifest verification;
- the runner prints `action=move_archives_outside_source_root`;
- package manifest generation/verifier do not ignore arbitrary ZIP files.

### OR-ISSUE-158 — external-model failures preserve typed privacy-safe evidence
- failed root Runs emit Run/attempt/model-invocation/latest-event/delegation metadata before cleanup;
- model invocation `errorCode` and token counts are retained;
- provider message content is represented only by length and SHA-256;
- conversation messages, Tool arguments, reasoning, transcript and event payload are absent.

### OR-ISSUE-159 — historical feature tests do not own mutable release identity
- retained STEP014D tests preserve its entrypoints and plan evidence;
- STEP014DR1 tests own current version and manifest identity;
- future corrective releases can advance current identity without rewriting historical facts.

### OR-ISSUE-160 — historical STEP014C does not nominate a later permanent current owner
- STEP014C retains its immutable plan/version;
- mutable generators align with the current root package version;
- no historical test requires a specific later STEP string in current generators.

## STEP014DR2 additional obligations

### OR-ISSUE-161 — Provider function-name grammar
- OpenRill canonical Tool names remain dotted and are never renamed in the Tool Registry, ledger, authorization or dispatch layers.
- `model-openai-responses` must project every provider function name to `^[A-Za-z0-9_-]{1,64}$`.
- A captured request containing `agent.spawn` must contain no dotted function name.
- A streamed provider alias must be restored to canonical `agent.spawn` before leaving the adapter.

### OR-ISSUE-162 — Stable canonical/alias round trip
- Alias identity is derived from the canonical Tool name and does not depend on request order or neighboring Tools.
- A valid canonical name and a dotted name with the same readable form must not collide.
- Historical function-call input items and current Tool definitions use the same alias.
- Unknown provider-returned aliases fail as `MODEL_STREAM_INVALID` and are never dispatched.

### OR-ISSUE-163 — Historical correction identity ownership
- retained STEP014DR1 tests preserve its plan version and acceptance/package entrypoints;
- retained tests do not require the mutable root version to remain STEP014DR1;
- current exact package identity belongs only to the current corrective acceptance.

## STEP014DR3 additional obligations

### OR-ISSUE-164 — item/call identity unification
- `output_item.added` may expose both item `id` and `call_id` while argument events expose only `item_id`;
- both identities resolve to one accumulator and one canonical Tool-call event;
- parallel provider calls remain distinct;
- conflicting identity bindings fail `MODEL_STREAM_INVALID`.

### OR-ISSUE-165 — empty Tool names never leave the adapter
- terminal Tool-call emission requires a non-empty canonical name;
- missing names fail in `model-openai-responses` and never reach `ToolRegistry.execute`;
- no `tool not found: ` blank-name path is accepted.

### OR-ISSUE-166 — privacy-safe Tool failure identity
- live diagnostics may expose Tool name, Tool-call id, event type, sequence and `isError`;
- diagnostics must not expose arguments, results, task, transcript, reasoning or raw event payload.

### OR-ISSUE-167 — historical DR2 does not freeze current release
- DR2 plan keeps `0.14.5-step014dr2` and DR2 acceptance/package entrypoints remain present;
- retained tests do not require the current root package to remain DR2;
- active source/version and manifest verifiers own the current exact identity.

## STEP014DR4 gates
- OR-ISSUE-168: create two default root children after one model turn and one default grandchild from the nested child.
- OR-ISSUE-169: persist only an allow-listed Tool error code and omit Tool arguments/results/private error text from diagnostics.
- OR-ISSUE-170: terminal live polling must not depend on the expected delegation count; structural assertions own the exact count/depth.
- OR-ISSUE-171: retained diagnostic tests allow bounded scalar metadata additions while continuing to reject Tool payload/private text.

- OR-ISSUE-172: retained checkpoint tests allow bounded scalar error metadata and continue to reject Tool payload/private content.

## STEP014DR5 gates

### OR-ISSUE-173 — Control UI module entrypoint is single-owned
- `index.html` contains exactly one module script and it equals `/assets/web/browser-app.js`;
- workspace build derives the browser module destination from the shared contract;
- external-model live acceptance fetches the served index and then the discovered canonical entrypoint;
- the canonical path returns JavaScript while `/assets/app.js` is not added as a compatibility route;
- actual Chromium tree/detail rendering remains required after static preflight.

## STEP014DR6

- OR-ISSUE-174: external-model acceptance requires direct parallel delegation only; depth-2 is deterministic evidence.
- OR-ISSUE-175: external model and nested Chromium UI run as separate stages.

## STEP014DR7

### OR-ISSUE-176 — every loopback response is terminally consumed
- deterministic UI module bytes are read before Chromium launch and cleanup;
- chunked and content-length responses complete without paused parser state;
- oversized, timed out, aborted and early-closed responses fail with typed acceptance errors.

### OR-ISSUE-177 — one live loopback transport owner
- audited STEP011/STEP012D/STEP014 fixtures import `live-loopback-http.mjs`;
- no executable global `fetch()` remains in those fixtures;
- every request has a label, timeout, byte bound and start/end marker;
- Chromium/Protocol/Host/root cleanup order remains machine-audited.

### OR-ISSUE-178 — Browser waits always attempt once
- `waitForBrowserCondition` performs one predicate evaluation even when the deadline is already reached;
- page-state diagnostics are read after that first attempt;
- short-timeout regression retains the expected connection and runtime evidence.

### OR-ISSUE-179 — historical entrypoint tests own semantics
- served HTML remains the entrypoint source of truth;
- either native Response text or bounded pre-consumed text is acceptable;
- exact module URL construction and `/assets/app.js` rejection remain mandatory.

### OR-ISSUE-180 — canonical validation is bounded and exact
- sorted unit files run in bounded isolated Node test children;
- `NODE_TEST_CONTEXT` is removed for each child;
- each TAP summary requires tests=pass, fail=0 and skipped=0;
- aggregate file and test totals must equal the current exact inventory.

### OR-ISSUE-181 — canonical files and loopback failures become quiescent independently

- Every canonical unit file runs in its own Node child; batch boundaries are progress/aggregation only.
- Each file has an independent timeout and `OPENRILL_CANONICAL_FILE_START/END` evidence with the repository-relative path.
- `NODE_TEST_CONTEXT` is removed only for the isolated child.
- Loopback timeout and oversized-body errors are returned only after request close (or a bounded close fallback), and regression fixtures require zero remaining server sockets.

### OR-ISSUE-182 — deterministic fixture imports have an explicit retained owner

- The current deterministic UI live script imports `step014dr6-deterministic-nested-fixture.mjs` as retained schema-14 evidence.
- No nonexistent current-step fixture path may be inferred by renaming.
- Current acceptance required-file inventory includes the live script and retained fixture.

### OR-ISSUE-183 — live Protocol client identity matches the current release

- Both STEP014DR7 live clients publish the exact root version `0.14.10-step014dr7`.
- The stale mixed literal `0.14.9-step014dr7` is rejected.

## STEP014DR8

### OR-ISSUE-184 — exact Vue materialization remains aggregate-owned
- STEP014DR8 acquisition, independent re-extraction and byte/hash verification must precede workspace build.
- `focused-build` and `deterministic-nested-control-ui-live` receive the same `OPENRILL_VUE_RUNTIME_VENDOR_DIR`.
- runtime, license, lock and archive are byte-identical across the primary and verification extraction.
- the current gate explicitly links this recurrence to historical OR-ISSUE-074.

### OR-ISSUE-185 — browser bootstrap evidence precedes selector assertions
- deterministic UI verifies Host-served Vue runtime and lock before Chromium launch.
- CDP runtime, console, log and network events are bounded and attached before `Page.navigate`.
- non-empty `Page.navigate.errorText` fails immediately with `OPENRILL_STEP014DR8_UI_NAVIGATION_FAILED`.
- UI readiness requires `startupPhase=READY`; a selector timeout includes bounded page state and diagnostics.

### OR-ISSUE-186 — historical corrective tests do not freeze the mutable root version
- retained STEP014DR7 tests assert DR7 acceptance/package entrypoints and immutable DR7 plan evidence;
- no retained DR7 test requires root `package.json.version` to remain `0.14.10-step014dr7`;
- exact current package/source/Host/manifest identity is owned only by the current release gates;
- canonical validation runs the retained DR7 boundary file on every later release.

### OR-ISSUE-187 — partial Chromium launch remains lifecycle-owned
- Chromium cleanup ownership begins immediately after `spawn`, before DevTools/CDP/navigation success;
- any pre-return launch failure closes CDP and terminates the child through the bounded common close path;
- Windows `taskkill /T /F` is followed by an explicit exit wait;
- simultaneous launch and cleanup failures preserve both causes through `AggregateError`.

### OR-ISSUE-188 — lifecycle audit includes the current live fixture family
- DR8 external and deterministic live clients are present in the HTTP and Host audit inventories;
- DR8 deterministic UI is present in the Chromium audit inventory;
- body-drain semantics are checked for retained DR6 and current DR8 deterministic fixtures;
- current partial-launch cleanup markers are audited before the lifecycle stage can pass.

### OR-ISSUE-189 — final live cleanup failures remain observable
- the current deterministic UI fixture captures a primary body error and independently attempts every cleanup;
- no Chromium, Protocol client, Host close/closed wait or temporary-root cleanup error is suppressed with `.catch(() => undefined)`;
- cleanup-only failure emits `OPENRILL_STEP014DR8_CLEANUP_FAILED`;
- simultaneous body and cleanup failures emit `OPENRILL_STEP014DR8_BODY_AND_CLEANUP_FAILED` with all causes in `AggregateError`.

## STEP014 closure / STEP015A validation reset 의무

### Independent acceptance dimensions
- Product core, required Integration, optional UI, Harness, and Package status are reported separately.
- Browser or Harness failure cannot invalidate a non-UI Product core without an explicit ownership argument in the STEP plan.
- A known optional UI or Harness failure remains visible in `HANDOFF.md` and the failure asset ledger; it is not rewritten as PASS.

### One-correction stop-loss
- The first same-class failure permits one bounded correction and affected-profile rerun.
- A second same-class failure stops Product-versioned corrective suffix creation.
- The owning layer is redesigned or moved to a visible backlog before Product work continues.
- Historical issue recurrence is recorded as failure of the previous prevention mechanism, not as an unrelated new issue.

### Failure asset time fields
- Material failure records include measured machine duration when evidence contains it.
- Human work duration is an explicit number or `NOT_RECORDED`.
- Conversation timestamps or estimates are not represented as actual work time.

### Browser scope
- Browser automation is mandatory only for a browser-owned Product change or a claim that cannot be proved below the browser boundary.
- STEP015A acceptance contains no Chromium, Playwright, Control UI, or browser-live stage.

### Mutable accepted-baseline schema ownership — OR-ISSUE-194
- Historical tests may not require an exact current `config/current-accepted-baseline.json.schemaVersion`.
- Historical tests validate a positive integer schema and generic required fields only.
- The current STEP acceptance owns exact schema semantics and dimensional fields.

### Historical release-line ownership — OR-ISSUE-195
- Historical STEP tests may not constrain mutable root identity to an old major/minor line.
- Historical tests own immutable plan, script, and feature evidence only.
- Current release identity is validated by current release gates; historical tests may check only generic syntax and inequality with their own historical identity.

### Time-ledger lifecycle ownership — OR-ISSUE-196
- Human effort and automated stage duration are independent fields.
- Unknown human effort remains `NOT_RECORDED`; it is never inferred from wall-clock timestamps.
- A completed measured automated run records a numeric duration and must not be rejected by a pre-run placeholder assertion.

## STEP015B Process execution backend gates

### OR-ISSUE-197 — canonical workspace root remains executable through every Product backend
- `ProcessManager` preserves canonical ledger `cwdRelative` but passes `cwd.relativePath || "."` to the backend contract.
- Focused acceptance executes the actual Host backend through `ProcessManager.backendRouting` at workspace root.
- Provider-plan or fake-provider tests alone cannot establish Product routing acceptance.
- Docker live promotion separately executes the actual Docker backend through the same Product route.

## OR-ISSUE-198 — Zero-dist execution-backend build order

- Package-candidate acceptance removes every package `dist` and `.artifacts` before compiling.
- `tsconfig.build.json` must place `packages/sandbox` before `packages/sandbox-docker` and
  `packages/tools-process`, and all three before `services/agent-host`.
- An incremental build with pre-existing declarations is not accepted as zero-dist evidence.

## OR-ISSUE-199 — Historical extensible-object ownership

- A historical test may not deep-equal an extensible current configuration object merely to verify
  fields introduced by that historical STEP.
- Historical tests assert only their owned fields; the current STEP owns new fields and full-shape
  validation.
- Exact-object comparison is reserved for objects explicitly declared closed by contract.

## OR-ISSUE-200 — Historical migration versus current schema ownership

- Historical STEP tests own immutable migration files and may assert a minimum schema lineage.
- They must not assert the exact mutable `OPENRILL_STATE_SCHEMA_VERSION` after a later append-only
  migration exists.
- Exact current schema is validated by the current STEP focused migration test.

## OR-ISSUE-201 — Repository-wide recurrence-class sweep

- After identifying a repeated ownership class, search the full relevant source/test tree before
  applying the correction.
- Historical STEP014 tests may assert migration 014 existence and current schema `>=14`, but not
  current schema exactly 14 or migration 014 as the final migration.
- STEP015B governance scans the historical unit suite for executable exact-schema-14 assertions.

## OR-ISSUE-202 — Root handoff accepted-baseline evidence

- Every current root handoff document retains the accepted baseline step, exact checks marker, and
  immutable ZIP SHA from `config/current-accepted-baseline.json`.
- Candidate status and accepted baseline status must be presented separately.


## OR-ISSUE-203 — Docker container identity evidence normalization

- A Docker live fixture must not compare the full ID from `docker create` with default `docker ps -q`
  output by exact string equality.
- Container identity evidence accepts only validated hexadecimal IDs of at least 12 characters and an
  exact or prefix relationship between full and abbreviated forms.
- Successful stale-prune evidence also requires an independent `docker ps -aq --no-trunc --filter id=...`
  query returning no container.
- Managed/profile label filters remain exact and are not weakened to solve an evidence-format mismatch.
- This class is owned by the Harness dimension and does not create a Product-versioned corrective suffix.

## STEP016A operational-closure governance gates

### OR-ISSUE-204 — Historical tests do not own the mutable accepted Product baseline

- retained STEP tests may validate immutable plans, evidence, and dimensional fields introduced by
  their own STEP;
- retained STEP tests must not require `config/current-accepted-baseline.json.step` to equal their
  historical baseline;
- exact current baseline step, checks marker, and immutable ZIP SHA are owned by current governance;
- canonical retains the corrected STEP015A governance test on all later candidates.

### OR-ISSUE-205 — Current handoff preserves unresolved failure-asset continuity

- `HANDOFF.md` keeps OR-ISSUE-190 and OR-ISSUE-191 visible until an explicit resolving STEP exists;
- a candidate handoff rewrite cannot silently omit unresolved accepted-lineage issues;
- accepted baseline step, exact checks marker, and ZIP SHA remain present beside candidate status;
- current governance requires the issue documents, registry entries, recurrence gates, and handoff
  visibility together.

## OR-ISSUE-206 — Windows DPAPI command transport

- Windows PowerShell invocation uses `-EncodedCommand` as the final argument.
- Operation, encrypted-file path, and prompt are non-secret child-process environment metadata.
- API-key bytes are never present in argv or environment and remain stdin/secure-prompt only.
- Focused tests decode the command, verify DPAPI CurrentUser ownership, and reject arguments after the encoded command.
- Failure diagnostics preserve bounded exit/timeout/signal/stderr evidence without echoing secret input.

## OR-ISSUE-207 — Current live aggregate owns the current live fixture

- A corrective aggregate must invoke the live fixture registered for the same current STEP, not a retained parent fixture.
- The aggregate and fixture must share exact STEP, Product version, and State schema marker identity.
- Current live-stage source rejects retained STEP016A fixture paths inside the STEP016AR1 live branch.
- A child stage `returncode=0` is not enough; its current marker remains required, but entrypoint drift is classified as Harness rather than Product failure.
- A Harness entrypoint correction does not create a new Product version or schema.

## STEP016B first local Conversation gates

- `openrill ask` accepts prompt text only from stdin; literal prompt argv and setup mutation options are rejected before Host startup.
- The Product test must execute the actual Host, configured model resolver, Responses adapter and durable State, not only injected fake model events.
- DPAPI or another configured OS secret provider is injected into Host model resolution; API-key bytes never move through argv or environment.
- Model adapter failures preserve their typed provider code in durable `run.failed` evidence and CLI JSON.
- The one-shot Host owns complete shutdown and releases metadata/profile lock before the command returns.
- Windows promotion uses a bounded loopback Responses fixture with exact Authorization/request/stream/persistence evidence; it never requires a paid external model.
- Browser and Connector stages are forbidden in STEP016B acceptance.
- OR-ISSUE-190 and OR-ISSUE-191 remain visible until explicitly resolved.

## OR-ISSUE-208 — Historical accepted-baseline ownership sweep

- Historical governance tests may read `config/current-accepted-baseline.json` only for generic dimensional shape or dynamic root-document consistency.
- They must not assert an exact historical step/checks/SHA as the mutable current baseline.
- Immutable historical acceptance is proved from its own evidence document.
- STEP016B governance scans the full unit tree for executable exact current-baseline assertions outside current ownership.

## OR-ISSUE-209 — Handoff continuity after full rewrite

- `HANDOFF.md` retains exact current accepted baseline step/checks/SHA.
- Unresolved OR-ISSUE-190/191 remain visible.
- Immediately preceding Product/Harness corrections OR-ISSUE-206/207 remain visible for continuation context.
- Connector deferral explicitly states that work remains speculative until a real adapter contract and executable API/event environment exist.

- STEP016C extends the OR-ISSUE-208 sweep through retained STEP016B governance; no historical test may require STEP016AR1 to remain current after STEP016B promotion.


## OR-ISSUE-210 — Current manifest identity cross-alignment
- `generate_package_manifest.py` and `verify_package_manifest.py` must expose the same current STEP and version.
- Both must match root `package.json` and `PACKAGE_MANIFEST.json`.
- A manifest failure with zero missing/extra/changed paths must surface identity details and cannot be misclassified as a Product defect.

## OR-ISSUE-211 — Accepted-baseline atomic identity

- `config/current-accepted-baseline.json` is validated as one identity, not as independent headline fields.
- `artifact` and `zip` must name the same immutable accepted ZIP.
- `evidence` must exist and name the same accepted STEP represented by `step`, `version`, `checks`, and SHA.
- dimensional required-integration and harness values must describe the accepted live path, not a retained parent STEP.
- a current promotion may not leave any prior accepted STEP token in artifact, evidence, or dimensional identity fields.

## OR-ISSUE-212 — Exact current candidate identity in root handoff documents

- `README.md`, `HANDOFF.md`, `PLANS.md`, `ROADMAP.md`, and `VALIDATION.md` must contain the exact current `PACKAGE_MANIFEST.json.step`.
- The same documents also retain the exact accepted-baseline STEP, checks marker, and immutable SHA.
- STEP shorthand, command names, or package-script aliases do not satisfy current candidate identity ownership.

## OR-ISSUE-213 — Pre-observed child close lifecycle

- A live fixture must not register a one-shot child `close` listener only after a stop command returns.
- Child close waiting registers the listener first and also accepts an already non-null `exitCode` or `signalCode`.
- Every wait has a bounded typed timeout and removes its listener on success or failure.
- Long live fixtures emit non-secret phase markers so an outer timeout identifies the last completed phase.
- This Harness correction does not create a new Product version or State schema.

## OR-ISSUE-214 — Authorized history and secret redaction are separate contracts

- A prompt supplied through stdin must not be echoed by setup, ask-result, list, status, stop, or Host startup diagnostics.
- An authenticated explicit `conversation show` command is expected to return durable user/assistant message content.
- API keys and other secrets remain absent from both transient output and authorized history output.
- A single broad substring assertion may not conflate prompt transport, explicit history disclosure, and secret redaction.
- This Harness correction does not create a new Product version or State schema.


## OR-ISSUE-219 — Valid memory provenance fixtures

- Memory tool tests must use Conversation/Run identifiers created by Product services.
- Synthetic nonexistent provenance must be tested only as an explicit fail-closed case.
- A successful remember assertion must prove the persisted provenance resolves to an existing durable Run.

## OR-ISSUE-220 — Strict Skill fixture syntax and configured eligibility

- Successful Skill fixtures use syntax accepted by the existing strict Skill YAML parser.
- Unsupported YAML shorthand belongs only in explicit invalid-manifest tests.
- Required-Tool eligibility is evaluated from the actual configured Product Tool set, not a static superset.
- Browser-required Skills fail closed when Browser Runtime is disabled.
- The parser failure is classified as correct Product behavior, not patched by weakening manifest validation.

## OR-ISSUE-221 — Host runtime current identity

- Every Host runtime-info version literal is mutable current identity and must match root/package/source version.
- Source/version alignment runs before package acceptance and reports every mismatched Host literal.
- Historical acceptance evidence may retain old versions; Product runtime source may not.

## OR-ISSUE-222 — Historical JavaScript callback option alignment

- A historical JavaScript fixture that injects an internal callback must prove that callback is executed.
- Coordinator preparation failure uses the current `resolveRunPreparation` boundary.
- Unknown extra object properties may not be treated as proof that an injection remains wired.
- The retained regression still requires durable `SKILL_PREPARATION_FAILED` before model resolution.

### OR-ISSUE-209 STEP018B recurrence extension

- Failure-asset ranges or slash-compressed identifiers do not satisfy ZIP-only handoff continuity.
- Every issue required by a retained historical Gate appears as an exact searchable `OR-ISSUE-NNN` token in current HANDOFF/VALIDATION assets.

## OR-ISSUE-223 — Accepted capability schemas survive Tool compaction

- `memory.remember`, `memory.search`, `memory.get`, and `memory.forget` remain directly visible core Tools.
- Tool catalog compaction runs prior accepted capability integration tests.
- Optimization may hide unrelated schemas but may not make an accepted primary workflow undiscoverable before its first action.

## STEP018C Agent task benchmark gates

### OR-ISSUE-224 — Temporal evidence is snapshotted at observation time

- Benchmark request recorders copy model-request values inside `onRequest` before Agent Kernel execution continues.
- A benchmark must not retain mutable request/message references as historical trace evidence.
- Multi-turn assertions identify Tool results by exact `toolCallId` or another durable identity, not by final-array position.
- Focused regression scans the STEP018C executor source for the request snapshot boundary.

### OR-ISSUE-225 — Benchmark fixtures use authoritative Product provenance

- Approval scenarios create and upsert a real temporary Workspace descriptor before Conversation, Tool-call and approval persistence.
- A successful approval-denial benchmark proves durable `WAITING_APPROVAL`, explicit denial and zero sensitive Tool-body executions.
- Foreign-key rejection of nonexistent Workspace, Conversation or Run provenance is correct fail-closed behavior and must not be weakened for fixture convenience.

### OR-ISSUE-208 STEP018C recurrence extension

- Retained STEP018B governance owns immutable STEP018B plan, source audit, issue records and Windows acceptance evidence only.
- It must not assert that root package version remains STEP018B or that STEP018A remains the mutable current baseline.
- STEP018C governance exclusively owns exact current candidate identity and the current accepted STEP018B checks/SHA tuple.

### STEP018C benchmark product invariants

- The `agent-core` profile contains ten primary semantic coverage identifiers and each has exactly one scenario owner.
- The benchmark uses actual OpenRill Agent Kernel, State and Product services with scripted local model adapters.
- Scoring is deterministic assertion, budget and evidence based; no LLM judge is introduced.
- Reports contain SHA-256 evidence digests instead of raw Product evidence and redact fake credentials.
- Two repeated attempts per scenario are required for Windows promotion.
- External model, Browser live and Connector are forbidden from STEP018C promotion.


## OR-ISSUE-226 — Current-root workspace-link ownership

- Every declared `@openrill/*` dependency must resolve by realpath inside the current source root.
- A materialized link that resolves to a prior extraction is a failure even when package names and versions match.
- Host focused tests may not reuse unverified absolute workspace links.
- `verify_workspace_module_links.py` is required before Product tests and packaging.

## OR-ISSUE-227 — Exact Tool-evidence identity in continued Conversations

- A continued Conversation is expected to contain historical Tool messages.
- Tests must select Tool evidence by exact Tool name and, when available, Tool call ID.
- Role-only, first-item or positional selection is forbidden for temporal assertions.
- Durable history must not be truncated merely to simplify a fixture.


## OR-ISSUE-228 — Historical migration introduction floor

- A historical capability test may assert that its introducing migration is present or that current schema is at least its introduction version.
- It may not require the global mutable State schema to remain equal to a historical version.
- Every opened database must equal the current runtime schema after migrations.
- Behavioral assertions for the historical capability remain mandatory.

## OR-ISSUE-229 — Runtime schema source-of-truth evidence

- A live schema check reads the authoritative built State runtime export, not a source barrel that merely re-exports it.
- Schema failure evidence includes the observed runtime schema value.
- A Harness source-of-truth correction does not increment Product version or State schema.
- The retained first Windows attempt remains visible as `33/34 FAILED` with Product tests `4/4 PASS` and canonical `646/646 PASS`.

## STEP019B detached Run and restart-resume gates

### OR-ISSUE-230 — Shutdown interruption is not operator cancellation

- Coordinator close aborts with the exact Host-shutdown reason.
- Kernel distinguishes `AGENT_HOST_SHUTDOWN` from `AGENT_CANCELLED`.
- A checkpointed shutdown leaves `CREATED/RESUMABLE`; an uncheckpointed shutdown leaves `FAILED/NON_RESUMABLE`.
- Explicit operator cancel remains terminal `CANCELLED` and never appears in `runnableRunIds()`.

### OR-ISSUE-231 — Durable root startup scheduling

- Host startup queries durable `CREATED` Runs after incomplete-Run recovery.
- Root Runs are scheduled without a client reconnect, resend or execute call.
- Delegated children remain owned by `runnableChildRunIds()`.
- A parent with an active delegation wait is excluded from root scheduling.
- The protocol integration test closes the client before Host restart and still observes the same Run completing.

### OR-ISSUE-232 — Fresh Attempt before preparation

- Recovered `CREATED` Runs allocate the next Attempt before Goal/Skill preparation.
- `run.attempt.prepared` records prior Attempt identity and recovery reason.
- Restart Goal continuation provenance equals the fresh Attempt.
- `WAITING_APPROVAL` resume reads Goal context without increasing continuation count.

### STEP019B product invariants

- Tool results checkpointed before shutdown are replayed from durable history and the Tool body runs once.
- No schema migration is introduced; runtime and opened State remain schema 17.
- Auto-resume is limited to existing checkpoint-safe execution and does not claim arbitrary in-flight transaction continuation.

## STEP020A durable background Task ledger gates

### OR-ISSUE-233 — Offline package-manager evidence separation

- Local source/package acceptance must not claim a successful registry-backed install when package-manager download failed.
- `pnpm-lock.yaml` is checked against every actual workspace manifest and dependency edge before build.
- Clean Windows promotion starts with `pnpm install --frozen-lockfile` and records that run separately.
- Registry/network bootstrap failure is classified independently from Product or lock failure.

### OR-ISSUE-234 — Current-root export materialization

- Every `@openrill/*` workspace link resolves inside the current source root.
- Missing current `dist` outputs are a build-bootstrap condition, not evidence that prior-root links may be reused.
- Acceptance removes generated outputs and completes a full current-source build before focused tests.
- `node_modules`, `dist` and bootstrap outputs are excluded from the immutable source ZIP.

### OR-ISSUE-235 — Optional compatibility injection, mandatory production wiring

- `AutomationConversationExecutor` remains compatible with retained callers that do not supply `TaskService`.
- Production Host lifecycle injects the real Task service.
- Automation execution reclassifies the one Task already created for its Run and never inserts a duplicate ledger row.
- Retained STEP012C Automation protocol tests and STEP020A Task classification tests run in the same affected gate.

### STEP020A Product invariants

- Every durable Run has exactly one durable background Task; Task is a lifecycle/activity ledger, not an execution scheduler.
- Task and Run creation/lifecycle transitions share the State transaction boundary.
- `CREATED/RESUMABLE` after an already-started Run remains Task `RUNNING`, never falsely returns to `QUEUED`.
- Task terminal states are monotone and `task.cancel` delegates authority to the owning Run lifecycle.
- Delegation uses explicit parent Task linkage; Automation reclassifies the existing Task.
- Task Flow orchestration, delivery/notification policy, retention and lost-task sweeping remain outside STEP020A.

### OR-ISSUE-236 — Public protocol capability closure

- Every newly registered public Local Protocol operation is added to the exact authenticated handshake capability contract.
- Broad capability advertisement and focused operation behavior tests must both pass.
- Task operations remain exactly `task.list`, `task.get`, and `task.cancel` in STEP020A.
- A protocol operation may not be treated as accepted merely because its focused service test passes.

## STEP020B durable Task Flow registry gates

### OR-ISSUE-237 — Workspace ownership precondition compatibility

- Task Flow persistence accepts every workspace ID authorized by the same configured Product boundary used by Conversation and Task services.
- Migration 019 does not require an unrelated `workspace_registrations` row.
- A linked Task must exist and share the Flow workspace.
- New physical foreign keys may not silently introduce a stronger registration workflow than the accepted domain contract.

### STEP020B Product invariants

- Goal/Plan, Task and Task Flow remain separate durable concepts.
- A Flow is controller-owned orchestration state, not a general scheduler or autonomous Plan executor.
- Every non-replay mutation uses expected-revision conflict detection.
- One Flow may link many Tasks; each Task may belong to at most one Flow.
- Waiting, blocked and resume state survive Host restart with stable Flow identity.
- Cancellation records a request, cascades through owning Task/Run cancellation and ends monotonically.
- Public operations remain exactly `taskFlow.list`, `taskFlow.get`, and `taskFlow.cancel` for STEP020B.

### OR-ISSUE-238 — Retained issue visibility in mutable continuation assets

- `HANDOFF.md` and `VALIDATION.md` retain the exact `OR-ISSUE-213` token while its historical close-race gate remains canonical.
- Every new failure observed during candidate validation receives its own issue asset instead of being folded into an older issue.
- Current-state document rewrites are validated against canonical retained-token tests before packaging.
- A continuity-token failure is not reported as a Product behavior failure when focused Product tests remain green.

### OR-ISSUE-239 — Complete canonical handoff-reader preflight

- `HANDOFF.md` and `VALIDATION.md` retain `OR-ISSUE-214` while the STEP016CH2 privacy gate remains canonical.
- Secret redaction, prompt echo outside history and authorized history visibility remain separate assertions.
- Before a full canonical rerun, execute every canonical test file that directly reads `HANDOFF.md` or `VALIDATION.md`.
- Restoring one missing retained token does not waive inspection of adjacent retained-token contracts.


## STEP020BR1 gates
- OR-ISSUE-240: Flow creation/read/mutation and Task links are scoped by Conversation owner key; mixed legacy rows are isolated.
- OR-ISSUE-241: `cancelRequestedAt` rejects new Task admission; exact persisted-link replay is revision-stable.

## STEP020C bound controller runtime gates

### OR-ISSUE-242 — Atomic child admission

- Owner, controller, revision, terminal, cancellation and wait-state checks occur before child creation.
- Message, Run, Attempt, Submission, Background Task, Task classification, Flow link, Flow revision and admission event share one SQLite transaction.
- A forced Flow-link failure leaves no message, Run, Task, submission or partial link.
- The Run coordinator is called only after the transaction commits.

### OR-ISSUE-243 — Explicit identity binding

- Public operation payloads are never spread into runtime dependency options.
- Only `workspaceId`, `ownerKey`, and `controllerId` are copied into a bound runtime.
- A non-empty public Task Flow `state` payload cannot replace the State database dependency.

### OR-ISSUE-244 — Replay scheduling boundary

- Exact child replay preserves message, Run, Task and Flow-link identities.
- A `CREATED` or currently `RUNNING` child may be ensured scheduled.
- A terminal or waiting child is returned without scheduler invocation.
- Host restart replay of a completed child reports `scheduled=false`.

### STEP020C Product invariants

- The bound controller runtime is Conversation-owner and controller scoped.
- Managed Flow creation and child admission are request-key idempotent and conflict detecting.
- `taskFlow.run` is an admission boundary, not an autonomous Plan executor.
- The Task Flow registry remains durable orchestration state; the existing Run coordinator remains the only Run executor.

### OR-ISSUE-245 — Clean build dependency order

- `packages/conversations` precedes `packages/task-flows` in the root TypeScript build references.
- `packages/task-flows/package.json` and `pnpm-lock.yaml` both declare `@openrill/conversations`.
- Acceptance deletes all package `dist` directories before the workspace build.
- A previously materialized declaration output may not mask an invalid source build order.

### OR-ISSUE-246 — Fresh dependency materialization remains inside the Fresh root

- Fresh verification never symlinks the entire `node_modules` directory back to another source root.
- The resolved root link-farm layout is copied with symbolic-link text preserved.
- Every copied `node_modules/@openrill/*` link resolves inside the Fresh extraction before module-link validation begins.
- The helper rejects a source `node_modules` that is itself a symbolic link.
- Reusing resolved materialization is reported separately from a registry-backed `pnpm install`; OR-ISSUE-233 remains authoritative for offline bootstrap.

## STEP020D Task and Task Flow maintenance gates

### OR-ISSUE-247 — Runtime-authority LOST boundary

- The accepted schema retains `background_tasks.run_id` with `ON DELETE CASCADE`; documentation and code do not invent a durable missing-Run Task state.
- Run/runtime remains execution Source of Truth and Task remains a projection.
- LOST requires runtime authority availability, elapsed Host recovery grace, an inactive Run, and a negative expected-idle predicate.
- LOST closes the owning Run FAILED/NON_RESUMABLE before or with Task LOST projection.

### OR-ISSUE-248 — Active authority is retention-protected

- A terminal Task whose owning Run is active remains report-only and has `cleanupAfter=null`.
- A terminal Flow with an active or missing linked Task remains report-only and has `cleanupAfter=null`.
- Retention preview excludes both states and reports them as protected active boundaries.
- Projection terminality alone never authorizes cleanup.

### OR-ISSUE-249 — Lifecycle-valid fixtures

- Maintenance fixtures use the accepted Run transition graph.
- Projection-drift tests corrupt only the projection after the authoritative Run reaches a valid terminal state.
- A test setup error is recorded separately from a Product behavior failure.

### OR-ISSUE-250 — Refresh after repair

- A LOST APPLY reloads both owning Run and Task after `markExecutionLost`.
- Later decisions in the same pass use refreshed state.
- The first APPLY may schedule safe retention; a second APPLY is idempotent and appends no duplicate events.

### OR-ISSUE-251 — Root clean-build evidence

- Acceptance removes generated outputs and invokes the root workspace build before focused tests.
- A dependent package is not treated as independently buildable when its workspace export dependencies have no materialized output.
- Immutable source ZIPs exclude `dist`, `.artifacts`, caches, and dependency directories.

### STEP020D Product invariants

- `task.audit` and `taskFlow.audit` never mutate State.
- `task.reconcile` and `taskFlow.reconcile` accept only PREVIEW or APPLY and perform only enumerated safe repairs.
- Host-start reconciliation runs after normal recovery opportunity and disables retention scheduling.
- Expected-idle Runs are never marked LOST.
- Normal Task Flow success/failure remains controller-owned; all-terminal children alone are report-only.
- Cancellation replay is idempotent and Flow finalization occurs only after child Tasks are terminal.
- Retention only schedules and previews candidates; physical prune is absent from STEP020D.
- Autonomous Goal Plan-to-Task execution, periodic sweeping, multi-Host leader election, external model, Browser LIVE, and real Connector remain deferred.

### OR-ISSUE-252 — Code-derived schema governance

- Migration governance uses the actual repository filename.
- SQL assertions tolerate formatting whitespace while preserving exact table/column semantics.
- A governance path or regex error is classified separately from Product migration behavior.

### OR-ISSUE-253 — Executable contract tokens

- Focused-evidence governance asserts existing test names, action codes, or service symbols.
- Paraphrased prose is not invented as a required source token.
- Passing focused Product tests are not reclassified as Product failures because a documentation-style assertion drifted.

### OR-ISSUE-254 — Validation asset ownership

- STEP acceptance, package, live Harness, and current manifest scripts own STEP identity and version.
- Generic source-version alignment owns the exact current version but need not duplicate the STEP name.
- Redundant constants are not added solely to make governance pass.

### OR-ISSUE-255 — Corrected assertions are independently rerun

- The active-child retention focused-evidence assertion uses the actual test title contract.
- Implementation governance separately checks active-authority retention protection.
- Each new validation assertion failure receives an independent issue asset even when it resembles a prior prose-token drift.

### OR-ISSUE-256 — Maintenance capability closure

- The authenticated Local Protocol exact operation list contains all six STEP020D maintenance operations in sorted order.
- Focused operation behavior and broad handshake capability advertisement run in separate acceptance groups.
- A public operation is not accepted merely because direct registry invocation succeeds.

### OR-ISSUE-257 — Full canonical evidence is indivisible

- An externally interrupted canonical run is never reported as Product PASS or FAIL without its completed file result.
- A single-file rerun may diagnose reproducibility but cannot replace full canonical evidence.
- Final acceptance requires one clean `OPENRILL_CANONICAL_BATCHES_PASS` marker with fail=0 and skipped=0.
- Timing thresholds are not relaxed solely because an isolated environment incident occurred.
- When the exact root cause is unproven, documentation says so and Product code remains unchanged.

### OR-ISSUE-258 — Aggregate process ownership

- A tool-call timeout is not interpreted as an acceptance-stage failure when the child remains alive.
- Before rerunning, inspect and terminate orphaned acceptance/canonical processes.
- Final evidence comes from one aggregate process that owns all stages and emits the final marker after exit.
- Stage logs from an orphaned parent are diagnostic only and are not composed into a synthetic PASS.

## STEP020E completion delivery and controller wake gates

### OR-ISSUE-259 — Immutable reconstruction

- A missing active worktree is restored only from the last immutable accepted ZIP.
- Reapplied changes are compared to that baseline and receive a new clean build and all acceptance stages.
- Tests passed before the disappearance are diagnostic only for the reconstructed tree.

### OR-ISSUE-260 — Effective Tool scope is durable

- A Run budget envelope stores only the actual model Tool definitions for that Run.
- Controller wake Runs expose exactly the seven bound `task_flow.*` tools.
- Normal child and delegation Runs expose no controller tools.
- Host restart resumes the same wake Run without widening its Tool scope.

### OR-ISSUE-261 — Upgrade continuation backfill

- A schema-21 active owner-matched terminal child produces exactly one schema-22 delivery intent.
- Historical success is `BLOCKED` review rather than unverified semantic success.
- Terminal, cancelling, cross-owner, or otherwise unsafe Flows are not awakened.
- The backfill appends an auditable `task.delivery.backfilled` event.

### OR-ISSUE-262 — Public projection fidelity

- Host controller tests consume the actual `TaskFlowView.tasks[].task` shape.
- A fixture-shape error is classified separately from Product behavior.
- The corrected scenario must pass in isolation and in the full focused suite.

### STEP020E Product invariants

- Terminal Task projection and its delivery intent commit in one State transaction.
- Owner system message, wake Run, silent wake Task, Flow wake event and delivery binding commit atomically.
- One Task terminal event has at most one delivery intent.
- Delivery is not complete without a successful durable controller decision Tool event.
- Empty or progress-only output is `terminalOutcome=BLOCKED`.
- Flow success/failure remains controller-owned; all-terminal children never imply automatic success.
- Pending and queued deliveries drain after Host restart with stable identity and no duplicate terminal replay scheduling.

### OR-ISSUE-263 — Historical evidence reads remain legal

- Historical governance stops owning mutable current identity but may read `package.json` to verify retained immutable entrypoints.
- A self-source prohibition never contradicts an executable assertion in the same test.

### OR-ISSUE-264 — Transaction governance follows actual persistence

- Delivery atomicity checks the actual SQL insertion and enclosing Task lifecycle transaction.
- An abstraction name is not invented solely for a governance token.

### OR-ISSUE-265 — Controller Tool symbols are code-derived

- Host governance asserts `bindingForWakeRun`.
- Durable Tool budget governance asserts actual effective model Tool definitions, independent of arbitrary callback variable naming except where matching inspected code.
- Focused restart evidence remains the behavioral authority for exact Tool isolation.

### OR-ISSUE-266 — Prose capitalization is not architecture

- Documentation assertions are case-insensitive when capitalization has no semantic meaning.
- The substantive boundaries remain strict: existing Run coordinator, controller-owned Flow outcome, autonomous Plan execution deferred.

### OR-ISSUE-267 — Delivery ledger owns pending state

- Task terminal event and delivery `PENDING` row share one State transaction.
- Delivery references the exact terminal `task_event_sequence`.
- Governance does not invent a second pending Task event.

### OR-ISSUE-268 — Historical lifecycle checks preserve semantics

- Retained Task governance verifies the current executable terminal-monotonicity guard.
- Incidental identifier casing is not treated as an immutable Product contract.
- The cumulative Product suite remains the behavioral authority.

## STEP020ER1 Windows Local Protocol restart connection gates

### OR-ISSUE-269 — Bounded transport-only reconnect

- `LocalCliProtocolClient.connect(timeoutMs)` uses one caller-owned overall deadline across retries.
- Only `PROTOCOL_CONNECT_FAILED` and pre-accept `PROTOCOL_CONNECTION_CLOSED` are retried.
- Backoff is bounded and cannot extend beyond the caller timeout.
- Host identity mismatch, authentication rejection, remote bind denial, and invalid protocol frames fail immediately.
- A failed old socket cannot clear a later successful socket.
- The exact STEP020E queued controller wake Run restart test remains in the focused Windows Harness.
- A Harness sleep is not accepted as the correction.

## STEP020ER2 Windows LIVE marker contract gates

### OR-ISSUE-270 — Shared structured marker contract

- One JSON contract owns current STEP, version, schema, Harness identity and all semantic fields.
- The live Harness renders from that contract; it does not maintain a second full marker literal.
- The aggregate validates exactly one marker as a key/value field set, independent of field order.
- Missing, extra, duplicate or changed fields fail with a bounded diff.
- `queue=SYSTEM_MESSAGE_WAKE_RUN` and `migration=TERMINAL_CHILD_SAFE_BACKFILL` are mandatory.
- A stage return code of zero is necessary but not sufficient; the structured marker must also pass.
- Product retry and completion semantics are not changed to repair an evidence-only mismatch.

### OR-ISSUE-271 — Failed candidates do not own mutable current identity

- STEP020ER1 retains its immutable runner, live Harness, package script, retry code and failure evidence.
- Current `package.json`, root continuation, source version alignment and package manifest scripts belong only to STEP020ER2.
- Historical governance must not reject a successor merely because mutable identity advanced.

## STEP020ER3 Windows Python validator entrypoint gates

### OR-ISSUE-272 — No implicit Python module search path

- Node invokes the validator through an absolute `.py` file path and `--validate-stdin`.
- Node converts file URLs with `fileURLToPath`; URL objects are not used as implicit Windows paths.
- The validator resolves its contract relative to `__file__`, not caller cwd.
- `python -c`, package-style `from scripts...` imports, and `PYTHONPATH` injection are forbidden for this bridge.
- A valid reordered marker passes from an external cwd containing spaces.
- A marker missing `queue` and `migration` fails with both keys in the diagnostic.
- A shadow caller-local `scripts` package cannot intercept the validator.
- The dedicated Python verifier, focused Product suite, canonical suite, and Windows LIVE Harness all execute this boundary.

### OR-ISSUE-273 — Failure evidence includes state

- Windows failure summaries preserve both count and state: `54/57 FAILED` and `20/23 FAILED`.
- An issue summary cannot weaken a failed Harness marker into a bare count.
- Product behavior is not modified to satisfy evidence wording.

## STEP021A durable Goal Plan executor gates

### OR-ISSUE-274 — One admission owner
- A controller Step request produces one Run, one Task and one Flow link.
- Goal executor wrappers never call the base admission a second time.
- The package must compile before Host wiring evidence is accepted.

### OR-ISSUE-275 — Goal-owned Flow mutation isolation
- Every `task_flow.*` mutation first resolves Goal execution ownership.
- An arbitrary request cannot bypass ordered Step identity, request key or text.
- Generic Flows retain their existing controller runtime behavior.

### OR-ISSUE-276 — Durable controller owns continuation
- Recovery may reconcile a terminal child to `READY`.
- A RUNNING execution never auto-admits that READY Step before completion delivery and controller decision.
- Creation and explicit resume may admit one READY Step.

### OR-ISSUE-277 — Blocked projection is complete
- Semantic `BLOCKED` atomically updates Step execution, Plan Step, Goal execution, Flow and Goal.
- Explicit resume returns Goal to `ACTIVE` and creates one new Task attempt.

### OR-ISSUE-278 — Execution-owned Goal mutation closure
- `setPlan`, `updateStep`, `reportBlocker`, `control` and `complete` reject with `GOAL_EXECUTION_ACTIVE` when a durable execution exists.
- Reads and executor-owned repository mutations remain available.
- Generic Goal behavior without an execution remains covered by STEP019A tests.

### OR-ISSUE-279 — Cancellation projection recovery
- A Flow may be durably CANCELLED before Goal projection without corrupting the Goal.
- Host recovery idempotently projects execution, nonterminal Steps, Plan Steps and Goal to CANCELLED.
- Exactly one `goal.execution.cancelled` projection event is retained.

### OR-ISSUE-280 — Protocol fixture dependency parity
- Protocol fixtures include production cancellation dependencies.

### OR-ISSUE-281 — Provenance fixture lifecycle
- Provenance source Runs are terminal before Host executor scenarios.

### OR-ISSUE-282 — Closed Tool schema fidelity
- Closed Tool schemas receive no invented fields.

### OR-ISSUE-283 — Wake Run result scoping
- Tool results are scoped to the current wake Run.

### OR-ISSUE-284 — Durable Tool call identity
- Tool call IDs are scoped by durable Run identity so exact replay is intentional and testable.

### OR-ISSUE-285 — Migration-token fidelity
- Governance asserts the actual `single_active` index and active-status predicate.

### OR-ISSUE-286 — Signature formatting independence
- Governance validates the hook type and optional parameter without requiring a one-line signature.

### OR-ISSUE-287 — Individual issue traceability
- Each observed fixture failure has its own issue token, evidence file and gate heading.

### OR-ISSUE-288 — Complete accepted evidence in handoff
- Every current root handoff contains accepted STEP, version, schema, checks, ZIP, SHA and evidence path.

### OR-ISSUE-289 — Failed candidates do not freeze the accepted baseline
- STEP020ER1 and STEP020ER2 retain immutable failure/correction evidence only.
- The accepted baseline may advance without editing Product history.

### OR-ISSUE-290 — Historical migrations do not own current schema
- Historical completion tests assert migration 022 semantics.
- Additive current schema advancement is validated by the current STEP only.

## STEP021B durable Plan revision, retry and blocker gates

### OR-ISSUE-291 — Plan revision number lacked immutable definition history
- schema 24 immutable agent_goal_plan_revision_steps snapshots and executor reads only its pinned snapshot.

### OR-ISSUE-292 — Draft controller wrapper could double-admit one Step
- one explicit executor admission result is returned without second base call.

### OR-ISSUE-293 — Delivery failure path referenced transaction-local binding
- failure path reloads durable delivery state outside transaction scope.

### OR-ISSUE-294 — Generic resume bypassed durable blocker resolution
- BLOCKED and FAILED require explicit resolveBlocker or retry with ledger evidence.

### OR-ISSUE-295 — Failed Step terminalized Flow before bounded retry
- failure projects durable BLOCKED plus TASK_FAILURE/RETRY_LIMIT blocker while Flow remains resumable.

### OR-ISSUE-296 — Delayed controller wake had no execution revision snapshot
- delivery stores all three revisions and mutations reject stale snapshots before writes.

### OR-ISSUE-297 — Start replay rejected an execution pinned to an older Plan revision
- replay validates durable owner/controller/Flow binding and preserves the pinned immutable revision.

### OR-ISSUE-298 — Historical STEP021A tests reclaimed current schema and resume semantics
- historical schema assertion is additive and BLOCKED resume uses explicit blocker resolution.

### OR-ISSUE-299 — Local Protocol exact capability omitted STEP021B operations
- exact list includes revisePlan/adoptPlanRevision/retry/resolveBlocker.

### OR-ISSUE-300 — Host adoption fixture treated terminal Step currentTaskId as permanent history
- assert terminal attempt count and linked Task identity instead of active currentTaskId.

### OR-ISSUE-301 — Historical completion baseline ownership
- STEP020ER1 through STEP020ER3 retain immutable failure, correction and Windows evidence.
- Only the current STEP owns the mutable accepted-baseline identity.

### OR-ISSUE-302 — Historical additive schema ownership
- Historical completion governance asserts migration 022 semantics.
- Additive current schema advancement is validated by the current STEP.

## STEP021BR1 Plan revision corrective gates

### OR-ISSUE-303 — Semantic stable-Step identity
- Completion is inherited only when immutable `stepId`, `title`, `required`, `retryMode`, and `maxAttempts` match.
- Changed and new Steps start with fresh attempt and terminal-result history.

### OR-ISSUE-304 — Revision-owned mutable projection
- An older pinned execution cannot update a changed current Plan Step.
- Identical immutable definitions may retain the compatibility projection.

### OR-ISSUE-305 — Unbounded blocker safety
- Adoption asks a dedicated existence query for any OPEN blocker.
- Paged or limited presentation lists never decide admission or adoption safety.

## STEP021BR2 Windows TAP summary parser gates

### OR-ISSUE-306 — TAP numeric summary parsing
- No current STEP021BR1 or STEP021BR2 live Harness constructs a digit-capturing expression through a JavaScript string escape.
- `scripts/node-tap-summary.mjs` parses `tests`, `pass`, `fail`, `cancelled`, `skipped`, and `todo` as structured integer lines.
- LF and Windows CRLF fixtures produce identical counts.
- Missing summary values remain `-1` and cannot satisfy a pass condition.
- Actual focused Product success is accepted only when process exit and all summary counts agree.


## STEP022A Local Extension gate

- invalid roots create zero capabilities and public diagnostics contain no absolute path;
- optional runtime inputs are omitted rather than passed as explicit `undefined`;
- an empty registry emits no discovery notice;
- manifests are deep-frozen and every runtime claim is exact, declared, unique, and complete;
- import/activation/deactivation are bounded and arbitrary Extension failures are generic publicly;
- duplicate capability conflicts recover deterministically after disable;
- repeated configured startup is idempotent;
- current baseline ownership belongs only to the current STEP governance; historical tests retain immutable evidence without freezing the baseline;
- only the private Host contract-error class may surface specific module-contract diagnostics; forged code strings cannot;
- every new fixture must use an existing helper and execute the intended Product path;
- immutable evidence tokens are asserted with their actual recorded capitalization;
- the current manifest is generated before preliminary canonical execution and regenerated after final documentation;
- additive Extension config blocks remain optional at the Host runtime boundary and default to an empty registry;
- Fresh source ZIP validation never runs build-dependent export imports before install/build; the package excludes `dist` and the aggregate orders workspace build before exports;
- Windows Live uses a path containing spaces and proves dynamic import, SecretRef resolution, all four protocol operations, shutdown and duplicate-free restart.

## STEP022B Durable Connector gate

- connector ingress is persisted before an acknowledgement can be returned;
- exact external-event replay is idempotent and changed content, route, or text fails closed;
- connector binding plus first Conversation, Message and Run admission is one transaction;
- logical deliveries, attempts and provider receipts have separate durable identities;
- a post-dispatch unknown outcome becomes `UNCERTAIN` and is never replayed automatically;
- expired pre-dispatch delivery claims return to `PENDING`, while expired post-dispatch claims are quarantined;
- Connector account ownership cannot move between Extensions or workspaces;
- adapter methods are snapshotted and an already-aborted activation signal cannot register;
- Connector Extensions register a real Host adapter; a manifest claim string alone never reaches READY;
- public list services validate IDs independently of protocol validation;
- protocol ledger reads omit payload, claim token, Extension error summaries and dead-letter summaries;
- `connector.recovered` is advertised and emitted only when recovery changed durable state;
- Windows Live uses a dynamically imported Connector Extension, real SQLite, real WebSocket protocol, path spaces and duplicate-free Host restart.
- STEP governance asserts actual source symbols and messages; it does not shorten class names or invent formatting-dependent tokens.
- historical Product tests assert their migration semantics additively and never freeze the current global schema number.
- regenerate `PACKAGE_MANIFEST.json` before cumulative governance that reads current manifest identity;
- historical STEP020 completion governance owns migration 022 semantics, not the latest schema number;
- historical STEP022A governance owns its immutable contract, package script and evidence, not current root headers or the later Connector dependency.
- the mutable manifest generator and verifier must carry the current STEP identity before manifest regeneration.
- Fresh verification creates/extracts the target directory from an existing parent workdir before selecting that directory as the next command workdir.

## STEP022C Mattermost real vertical gate

- Every adopted Connector Run is handed to the Host Agent Run coordinator immediately and is also recoverable from durable CREATED state after restart.
- Every completed Connector-origin Run with assistant text projects exactly one idempotent logical delivery to the bound channel and optional thread.
- Mattermost Extension activation uses one Host-owned connector claim, bounded first connection readiness, SecretRef-only token resolution, and lifecycle-scoped unregister.
- Mattermost REST POST ambiguity after dispatch is `MAYBE_ACCEPTED`; it is never downgraded to `NOT_SENT` or automatically replayed.
- Provider receipt identity is queryable by delivery and preserves message, conversation, and thread ids.
- Public status and doctor outputs are rebuilt from closed fields, validate connector identity, and cannot expose URL, token, payload, or arbitrary Extension fields.
- Doctor proves REST identity and a bounded WebSocket open/authentication challenge; Windows Live proves a real posted event and remote reply.
- Mention routing is username-boundary exact, and broadcast channel/user/team metadata must match the embedded post.
- WebSocket ingress persistence failure retries and forces reconnect instead of being silently swallowed.
- Local Protocol exposes strict `connector.status` and `connector.doctor` operations.
- Host tests isolate Mattermost WebSocket mocks from the Host Local Protocol and keep profile-id grammar distinct from path-with-spaces coverage.
- Windows Live always emits exactly 56 checks, fills every unvisited check on failure, uses separate bot and user credentials, and proves durable and remote duplicate-free restart.
- Historical STEP022B governance validates immutable contract, package, and schema-25 behavior; it never freezes the current root package version.
- Historical protocol tests assert their retained operations without freezing later additive capabilities.
- Historical Extension lifecycle fixtures use a compatibility range that does not expire at the next STEP; dedicated tests own incompatibility rejection.
- The current authenticated Local Protocol acceptance owns one exact sorted capability list and includes both `connector.status` and `connector.doctor`.
- Meta-governance follows the corrected semantic contract and never restores obsolete exact-count wording through string assertions.

## STEP022CR2 integrated Mattermost Testbed gate

- The full OpenRill source ZIP contains `testbeds/mattermost/`; a second Testbed project directory is never required.
- `start-and-run-step022c-live.cmd` and `.ps1` accept no OpenRill root path argument and derive the current source root.
- The CMD entrypoint never relies on PowerShell continuation syntax entered by the operator.
- The root wrapper executes `pnpm install --frozen-lockfile` in the same source root before the unchanged STEP022C Live gate.
- The Mattermost image uses a verified exact tag and never `latest`; the service binds only to `127.0.0.1` and uses named volumes.
- Session tokens remain process-memory only and are never printed or persisted by Testbed code.
- Testbed regression resolves repository files from `import.meta.url`, not caller cwd.
- STEP022C Product version `0.24.0-step022c` and schema 25 remain unchanged because this corrective changes validation/bootstrap packaging only.
- Canonical split-run reconciliation compares repository-relative POSIX file identities on both sides before claiming missing, extra, or order drift.


## STEP022CR3 Windows CMD entrypoint byte-contract gate

### OR-ISSUE-372 — Packaged CMD bytes are executable evidence

- `start-and-run-step022c-live.cmd` is non-empty ASCII with Windows CRLF only; bare LF and bare CR are forbidden.
- The CMD entrypoint changes to `%~dp0`, verifies `pnpm`, runs `call pnpm install --frozen-lockfile`, then `call pnpm mattermost:testbed:live` directly.
- The primary CMD entrypoint never depends on a PowerShell wrapper and never accepts an external OpenRill root argument.
- Start/stop/reset CMD helpers are likewise non-empty CRLF scripts rooted at `%~dp0`.
- The deterministic package script reopens the produced ZIP and validates the exact entry bytes before reporting success.
- A Fresh extraction rechecks byte length, CRLF, required commands and package manifest before distribution.

- OR-ISSUE-374: historical entrypoint tests own user-visible invocation semantics, not a superseded shell-delegation implementation.
- OR-ISSUE-375: after an outer timeout, inspect acceptance child-process liveness before rerunning; concurrent cleanup/build against an active canonical process is forbidden.


## STEP023A periodic maintenance physical retention gate

- OR-ISSUE-376: expiry is never sufficient for physical deletion; current reference protections are re-evaluated in the delete transaction.
- OR-ISSUE-377: Connector delivery retention is durable through `cleanup_after` and only safe terminal delivery states are scheduled.
- OR-ISSUE-378: one durable lease owner controls prune work and ownership is checked in the same transaction immediately before deletion.
- OR-ISSUE-379: a minimal hashed tombstone commits before cascade deletion; no root ledger row is removed without fresh prune evidence.
- OR-ISSUE-380: `UNCERTAIN`, `DEAD`, OPEN dead letters and receipt-less DELIVERED rows are never automatically pruned.
- OR-ISSUE-381: periodic retention uses `scheduleRetention()` and never invokes lifecycle reconciliation as a side effect.
- OR-ISSUE-382: completed pagination returns `nextCursor=null`; lease loss returns only the last committed continuation.
- OR-ISSUE-383: tombstone identity collisions fail closed and leave the source entity intact.
- OR-ISSUE-384: historical Protocol tests own retained capabilities, not the latest complete operation list.
- OR-ISSUE-385: historical STEP020D startup tests disable later STEP023A auto-arm rather than freezing future Host startup behavior.
- OR-ISSUE-386: retention scheduling selects unscheduled terminal rows directly so a scheduled prefix cannot starve later history.
- OR-ISSUE-387: SQLite `changes` is normalized with `Number(...)` before numeric aggregation.
- OR-ISSUE-388: fixtures use actual schema column names and never infer a column from domain wording.
- OR-ISSUE-389: privacy regression asserts the closed public tombstone shape, not user-controlled/generated identifier substrings.
- OR-ISSUE-390: lease-loss tests force expiry without allowing proactive renewal to mask the target race.
- OR-ISSUE-391: periodic sweeps persist a deterministic cursor in `maintenance_sweep_state`; a protected prefix cannot starve later eligible rows across restart.
- OR-ISSUE-392: governance assertions follow actual source symbols and semantic ordering; never rewrite Product code to satisfy guessed token names or formatting.
- OR-ISSUE-393: historical migration tests stop at the migration they own before asserting its schema number; applying all current migrations must not be paired with a historical exact current-version assertion.
- OR-ISSUE-394: historical governance never freezes the latest global schema constant; it proves the migration/version semantics it owns.
- OR-ISSUE-395: a historical Product step owns immutable contract/package evidence, not later root package or mutable manifest identity.
- OR-ISSUE-396: a validation/bootstrap corrective cannot permanently freeze the Product root version after independent Product development resumes.
- OR-ISSUE-397: advancing a source candidate requires the mutable manifest STEP and VERSION to move atomically; split step/version identity is a packaging failure.
- OR-ISSUE-398: historical integration fixtures must not expire at the next Product version through an unrelated `maxExclusive`; explicit incompatibility tests own upper-bound rejection.
- OR-ISSUE-399: historical packaging/bootstrap tests prove their immutable baseline through corrective-owned assets and never reclaim the current root Product version.
- OR-ISSUE-400: a STEP acceptance issue-asset range and its governance range advance atomically whenever a new independently recorded issue is added.
- OR-ISSUE-401: acceptance orphan detection compares exact process argv identities and never substring-matches the current shell command text.
- OR-ISSUE-402: every new Python acceptance entrypoint is import-executed before long-running stages, and shared helper symbols are imported from their actual owner modules.
- OR-ISSUE-403: Fresh source verification is invoked through `scripts/verify_step023a_fresh.py` from an existing workdir; the verifier itself creates the extraction directory before using it as a subprocess cwd.
- OR-ISSUE-404: governance for the Fresh verifier follows actual source call structure and never invents formatting-specific token spellings.

## STEP023AR1 GitHub publishing source-hygiene gate

- OR-ISSUE-405: Git distribution owns the executable byte contract through `.gitattributes`; `*.cmd` is always checked out as CRLF regardless of contributor-local `core.autocrlf`.
- OR-ISSUE-406: `.gitignore` covers `.env`, `.env.*`, PEM/key/P12/PFX shapes while explicitly retaining environment example templates.
- OR-ISSUE-407: a third-party/reference license declaration never licenses OpenRill by inference; public open-source status requires an explicit root OpenRill license decision.
- OR-ISSUE-408: a complete multi-thousand-file source baseline is published through Git commit/push, not repeated browser upload batches; generated STEP ZIPs are release artifacts, not tracked source.
- OR-ISSUE-409: Git preserves exact package-manifest bytes by default; EOL conversion is opt-in only for files with an explicit worktree byte contract.
- OR-ISSUE-410: source-vs-clone byte comparison reuses the exact package-manifest exclusion boundary; `__pycache__`, bytecode and other generated outputs cannot create transport false negatives.
- Publication correction must not modify STEP023A Product runtime semantics, schema 26, accepted baseline identity, or Mattermost promotion state.

