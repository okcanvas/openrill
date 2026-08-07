# Engineering Issue Registry

OpenRill에서 실제로 발생했거나 반복 가능성이 확인된 결함을 누적한다. 이 문서는 회고가 아니라 **다음 구현과 수용에서 강제되는 재발 방지 계약**이다.

## 운영 규칙

1. 실제 실패는 `OR-ISSUE-NNN`을 부여한다.
2. 증상, 정확한 원인, 영향 범위, 수정, 영구 gate, 상세 증거 문서를 기록한다.
3. 원인을 추측 상태로 종료하지 않는다. 코드·로그·실행 경로로 확정한다.
4. 단일 파일 수정으로 끝내지 않고 같은 결함군을 저장소 전체에서 차단한다.
5. 해당 STEP acceptance는 Issue Registry 항목과 영구 gate를 검사한다.
6. Windows live 실패는 `reference/validation/`에 원문 기반 상세 문서를 남긴다.
7. 문제를 숨기기 위한 `--no-frozen-lockfile`, `skipLibCheck`, locale 의존 decode, 무조건적 retry는 해결책으로 인정하지 않는다.

## Registry

| ID | 최초 단계 | 문제 | 정확한 원인 | 영구 해결·gate | 상세 증거 |
|---|---|---|---|---|---|
| OR-ISSUE-001 | STEP001 | pnpm broken lockfile | dependency 없는 importer가 YAML null로 기록됨 | 모든 importer는 object이며 null importer 0을 검사 | `docs/plans/STEP001A_PNPM_LOCKFILE_REPAIR.md` |
| OR-ISSUE-002 | STEP001A | frozen install config mismatch | workspace effective `autoInstallPeers=true`, lockfile `false` | workspace와 lockfile 값을 명시적으로 동일하게 검사 | `docs/plans/STEP001B_PNPM_LOCKFILE_SETTINGS_ALIGNMENT.md` |
| OR-ISSUE-003 | STEP001B | Windows subprocess cp949 decode | Python `text=True`가 Node UTF-8 출력을 cp949로 해석 | binary capture 후 UTF-8 decode 공통 helper | `docs/plans/STEP001C_WINDOWS_UTF8_SUBPROCESS_CAPTURE.md` |
| OR-ISSUE-004 | STEP001C | Windows CLI가 main을 실행하지 않음 | `D:` 경로를 URL scheme으로 오인 | `pathToFileURL(resolve(argv1))` 직접 실행 판정 | `docs/plans/STEP001D_WINDOWS_CLI_ENTRYPOINT_CANONICALIZATION.md` |
| OR-ISSUE-005 | STEP002 | Node global TypeScript 오류 | TypeScript 6의 ambient `types=[]` 기본값 | base/node/web 타입 환경을 명시하고 workspace 상속 검사 | `reference/validation/STEP002_WINDOWS_TYPESCRIPT6_FAILURE.md` |
| OR-ISSUE-006 | STEP002A | Linux target 경로에 Windows drive가 붙음 | target platform 선택 후 host-native `path.resolve` 사용 | target별 `path.win32`/`path.posix` 선택 | `reference/validation/STEP002A_WINDOWS_PROFILE_PATH_FAILURE.md` |
| OR-ISSUE-007 | STEP003 | 성공한 Node test를 FAIL 판정 | 기본 reporter의 OS별 glyph 문자열에 의존 | 명시적 TAP reporter와 deterministic marker | `reference/validation/STEP003_WINDOWS_DEFAULT_REPORTER_FAILURE.md` |
| OR-ISSUE-008 | STEP006 | JSON read cp949 실패 | Python `Path.read_text()` encoding 생략 | 모든 repository text I/O UTF-8 명시, AST gate | `reference/validation/STEP006_WINDOWS_DEFAULT_TEXT_DECODING_FAILURE.md` |
| OR-ISSUE-009 | STEP001D~STEP006 | acceptance 후 manifest hash 변동 | 성공 보고서에 시간·절대경로·임시경로 저장 | 성공 detail은 stable token, fresh-ZIP post-rerun manifest gate | `docs/testing/RECURRENCE_PREVENTION_GATES.md` |
| OR-ISSUE-010 | STEP005 | DB 무관 CLI가 SQLite를 eager load | CLI 정적 import chain이 Host/State까지 연결 | lifecycle 명령별 dynamic import, control subpath 분리 | `docs/plans/STEP005_SQLITE_STATE_AND_MIGRATION_FOUNDATION.md` |
| OR-ISSUE-011 | STEP006 | 이전 acceptance 중첩으로 O(n²) 실행 | 매 STEP이 모든 이전 STEP runner를 다시 호출 | 전체 unit/architecture suite 1회 + 직전 핵심 live regression | `docs/testing/RECURRENCE_PREVENTION_GATES.md` |

| OR-ISSUE-012 | STEP007 | 새 migration이 과거 state test를 실패시킴 | 테스트가 migration `[1,2,3]`과 future version `4`를 하드코딩 | schema 상수와 migration inventory에서 기대값을 계산 | `docs/plans/STEP007_AGENT_KERNEL_AND_MODEL_ADAPTER.md` |
| OR-ISSUE-013 | STEP008 | packaged baseline 문서가 Windows 수용 결과·현재 수치와 불일치 | baseline 문서 간 공통 상태를 비교하는 gate 없음 | README/HANDOFF/PLANS/ROADMAP/VALIDATION coherence gate | `reference/validation/STEP008_BASELINE_DOCUMENT_DRIFT.md` |
| OR-ISSUE-014 | STEP008 | Artifact가 필요한 file Tool이 ENOENT로 실패 | Artifact store가 자신의 root가 이미 생성되었다고 가정 | store-owned root creation, partial cleanup, Tool fixture gate | `reference/validation/STEP008_ARTIFACT_ROOT_INITIALIZATION_FAILURE.md` |
| OR-ISSUE-015 | STEP008 | schema 5에서 과거 state identity assertion이 4를 기대 | OR-ISSUE-012 수정과 gate가 일부 hardcode만 덮음 | 모든 identity/sequence/future 기대를 schema 상수에서 계산 | `reference/validation/STEP008_SCHEMA_DERIVED_EXPECTATION_GAP.md` |
| OR-ISSUE-016 | STEP008 | 올바른 OpenClaw evidence 3건이 whitespace로 실패 | actual만 strip하고 expected excerpt는 보존 | expected/actual 대칭 정규화 + external 118/118 gate | `reference/validation/STEP008_REFERENCE_EVIDENCE_WHITESPACE_NORMALIZATION.md` |
| OR-ISSUE-017 | STEP008 | 동시 same-file optimistic write가 둘 다 성공 가능 | revision check와 atomic rename 전체를 감싸는 mutation serialization 없음 | realpath-keyed per-file queue + one-winner concurrency test | `reference/validation/STEP008_SAME_FILE_MUTATION_SERIALIZATION.md` |
| OR-ISSUE-018 | STEP008 | generated package manifest가 STEP007/0.7로 선언됨 | manifest generator/verifier release identity가 이전 STEP literal에 결합 | current STEP/version source gate + generated manifest identity verification | `reference/validation/STEP008_PACKAGE_MANIFEST_RELEASE_IDENTITY_DRIFT.md` |
| OR-ISSUE-019 | STEP008 | synthetic API key fixture literal이 source ZIP에 포함됨 | live fixture와 outer acceptance가 동일 secret literal에 결합 | runtime random secret generation + static assignment rejection gate | `reference/validation/STEP008_SYNTHETIC_SECRET_FIXTURE_LITERAL.md` |
| OR-ISSUE-020 | STEP009 | approval interrupt가 일반 Tool failure로 wrapping됨 | Tool Runtime catch가 typed approval interrupt를 보존하지 않음 | `ToolApprovalRequiredError` passthrough + Kernel wait/resume live gate | `reference/validation/STEP009_APPROVAL_INTERRUPT_WRAPPED_AS_TOOL_FAILURE.md` |
| OR-ISSUE-021 | STEP009 | 빠른 foreground process가 output close를 영구 대기 | child exit 뒤 등록한 `close` listener가 이미 발생한 event를 놓침 | `stream/promises.finished()` + 실제 child 종료 unit/live gate | `reference/validation/STEP009_PROCESS_OUTPUT_STREAM_COMPLETION_RACE.md` |
| OR-ISSUE-022 | STEP009 | additive schema/protocol/Tool surface 확장을 이전 test·live fixture가 실패로 판정 | schema 5, STEP008 capability, 여섯 Tool exact 목록 하드코딩 | schema constant derivation + required-subset regression + STEP009 public capability/Tool gate | `reference/validation/STEP009_EXTENSION_EXPECTATION_DRIFT.md` |
| OR-ISSUE-023 | STEP009 | final ZIP source 검사에서 synthetic credential-shaped literal 3개 발견 | unit fixture 고정 prefix와 acceptance 금지 marker 자체가 source에 포함 | cryptographic runtime secret + generic report regex + full source literal-zero gate | `reference/validation/STEP009_SYNTHETIC_SECRET_LITERAL_RECURRENCE.md` |

| OR-ISSUE-098 | STEP013B2 | additive Browser Tools failed retained B1 gates | historical tests/runners compared the complete current inventory to exactly six tools | retained-prefix gates for historical steps; exact 12-tool inventory owned only by STEP013B2 | `reference/validation/STEP013B2_HISTORICAL_BROWSER_TOOL_INVENTORY_FREEZE.md` |
| OR-ISSUE-099 | STEP013B2 | B1 snapshot identity could not build a supported Playwright action locator | read-only raw CDP AX identity had no public Playwright Locator bridge | adapter-owned AI aria refs and `aria-ref=` locators; provider-neutral opaque/public mapping gates | `reference/validation/STEP013B2_READ_ONLY_AX_ID_ACTION_LOCATOR_GAP.md` |
| OR-ISSUE-100 | STEP013B2 | action navigation could dispatch before policy rejection or expose generic network error | action target URL is discovered in Browser request lifecycle, not Tool input | context pre-dispatch top-level guard, typed denial retention, final URL recheck, live deny gate | `reference/validation/STEP013B2_ACTION_NAVIGATION_PRE_DISPATCH_POLICY_GAP.md` |
| OR-ISSUE-101 | STEP013B2 | modal dialog could block an action until timeout | no adapter dialog observer/response boundary existed in B1 | bounded observation, safe dismiss, `BROWSER_DIALOG_BLOCKED`, later-action continuity gate | `reference/validation/STEP013B2_MODAL_DIALOG_ACTION_TIMEOUT_RISK.md` |

| OR-ISSUE-102 | STEP013B2 | retained B1A reporter test failed after current version advanced | historical command-retention test also froze mutable root package version at 0.13.6 | historical identity asserted in dedicated plan; current version owned by alignment verifier; static anti-freeze gate | `reference/validation/STEP013B2_HISTORICAL_REPORTER_TEST_RELEASE_VERSION_FREEZE.md` |

| OR-ISSUE-103 | STEP013B2 canonical | root docs correctly promoted B1A but historical baseline test still required AR4 | OR-ISSUE-093 advanced literals instead of creating a canonical mutable accepted-baseline owner | `config/current-accepted-baseline.json`, dynamic root-doc/evidence gate, no accepted literal in historical test | `reference/validation/STEP013B2_CANONICAL_ACCEPTED_BASELINE_OWNER_GAP.md` |

| OR-ISSUE-104 | STEP013B2 final aggregate | canonical reported 289/290 but emitted failure block omitted the failing test | B2 runner stored the last 20 KB and then printed only the last 10 KB of long stage output | complete per-stage logs, anchor-preserving bounded excerpt, no second truncation, focused synthetic early-failure gate | `reference/validation/STEP013B2_ACCEPTANCE_STAGE_FAILURE_EVIDENCE_TRUNCATION.md` |

| OR-ISSUE-105 | STEP013B3 | additive schema 10 and three Browser Tools failed retained Browser gates | historical tests froze the mutable current schema/tool total instead of their owned minimum/prefix | historical minimum-schema and retained-prefix gates; exact schema 10/tool 15 ownership only in B3 | `reference/validation/STEP013B3_HISTORICAL_SCHEMA_AND_TOOL_COUNT_FREEZE.md` |
| OR-ISSUE-106 | STEP013B3 | existing workspace Tool Artifact output gained `sizeBytes` | generalized internal Artifact writer result was returned directly by legacy methods | explicit legacy `{artifactId,kind}` projection plus exact response regression | `reference/validation/STEP013B3_LEGACY_ARTIFACT_RESPONSE_SHAPE_WIDENING.md` |
| OR-ISSUE-107 | STEP013B3 | download named `source.json` could lose payload bytes | payload and control metadata used the same object/file key | reserved-name remap and exact-byte download fixture | `reference/validation/STEP013B3_DOWNLOAD_RESERVED_FILENAME_COLLISION.md` |
| OR-ISSUE-108 | STEP013B3 | Browser payload accepted at 8 MiB could exceed total Artifact envelope, and raw page titles could consume unbounded metadata space | payload bound equaled total multi-file Artifact bound and title metadata crossed the adapter boundary without an explicit limit | 64 KiB envelope headroom, 4,096-character title bound, and fail-before-metadata overflow gates | `reference/validation/STEP013B3_BROWSER_PAYLOAD_ARTIFACT_ENVELOPE_LIMIT_MISMATCH.md` |
| OR-ISSUE-109 | STEP013C | retained B3 gates froze schema 10 and current Tool registration shape | historical feature ownership was mixed with mutable latest-release identity | minimum-schema/retained-Tool historical gates; exact schema 11 and ledger wrapping owned by C | `reference/validation/STEP013C_HISTORICAL_SCHEMA_TOOL_OWNERSHIP_FREEZE.md` |
| OR-ISSUE-110 | STEP013C restart | completed-Tool checkpoint was ignored when a later `model.requested` became the latest event | recovery inspected only the final event type instead of the safe suffix after the latest checkpoint | checkpoint suffix classification allowing only model.requested/model.retry | `reference/validation/STEP013C_POST_CHECKPOINT_MODEL_REQUEST_RECOVERY_MISCLASSIFICATION.md` |
| OR-ISSUE-111 | STEP013C restart | provider request killed by Host death left model invocation STARTED forever | incomplete Run recovery terminalized attempts/runs but not model invocation rows | FAILED/MODEL_INTERRUPTED_BY_RESTART closure with ended_at | `reference/validation/STEP013C_STARTED_MODEL_INVOCATION_RESTART_STRANDING.md` |
| OR-ISSUE-112 | STEP013C durable evidence | first ledger revision duplicated raw console/page-error text into SQLite | bounded in-memory evidence was treated as persistence-safe evidence | SHA-256/length text projection and independent URL re-redaction | `reference/validation/STEP013C_DURABLE_EVIDENCE_RAW_TEXT_DUPLICATION.md` |

## 신규 이슈 종료 조건

- 정확한 실패 명령과 terminal output 보존
- 오류가 발생한 실제 코드 위치 확인
- 최소 재현 또는 실패 fixture 추가
- 수정 전 실패·수정 후 통과 증거
- 동일 결함군을 막는 자동 gate
- `HANDOFF.md`에 현재 상태와 pending live 여부 기록
| OR-ISSUE-024 | STEP010 | Skill unit fixture가 격리되지 않은 기본 profile DB를 재사용 | 존재하지 않는 `OPENRILL_HOME`을 설정해 실제 path resolver가 무시함 | 지원되는 `OPENRILL_DATA_ROOT`/`OPENRILL_CONFIG_ROOT`만 사용하고 unsupported fixture variable 0 gate | `reference/validation/STEP010_UNSUPPORTED_PROFILE_ENV_TEST_ISOLATION.md` |
| OR-ISSUE-025 | STEP010 | Skill source revision이 원본 변경 후에도 동일 | `root_revision`을 source 경로 문자열만 SHA-256하여 content/diagnostic 변경을 반영하지 않음 | canonical manifest metadata+diagnostic digest와 변경 fixture | `reference/validation/STEP010_SKILL_SOURCE_REVISION_INTEGRITY.md` |
| OR-ISSUE-026 | STEP010 | 동일 Run/Skill snapshot 동시 capture 또는 잔여 destination이 다른 content와 결합 가능 | deterministic destination rename 충돌을 기존 directory 존재만으로 성공 처리하고 content를 재검증하지 않음 | Run+Skill capture serialization, unowned destination cleanup, 모든 snapshot 파일 hash 검증 | `reference/validation/STEP010_SKILL_SNAPSHOT_CAPTURE_RACE.md` |
| OR-ISSUE-027 | STEP010 | Skill snapshot 준비 실패 시 Run이 `CREATED`에 남음 | coordinator가 Kernel 진입 전 resolver 예외를 notice로만 발행하고 durable Run transition을 수행하지 않음 | `SKILL_PREPARATION_FAILED` durable failure transition과 model-call-zero fixture | `reference/validation/STEP010_PRE_KERNEL_SKILL_FAILURE_STATE.md` |
| OR-ISSUE-028 | STEP010 | `SKILLS.md` manifest 예시가 실제 parser 계약과 불일치 | placeholder 문서가 `summary/entry/allowedTools`를 사용하고 구현의 `description/instructions/tools`로 갱신되지 않음 | contract-key coherence static gate와 실제 builtin manifest parse gate | `reference/validation/STEP010_SKILL_CONTRACT_DOCUMENT_DRIFT.md` |
| OR-ISSUE-029 | STEP010 | final ZIP credential-shape scan이 과거 STEP008 acceptance literal을 발견 | secret 비저장 검사를 위한 marker 자체가 `...API_KEY=` 연속 문자열로 source에 남음 | marker token 분할 + 전체 ZIP credential-assignment/literal scan | `reference/validation/STEP010_HISTORICAL_SECRET_MARKER_LITERAL.md` |
| OR-ISSUE-030 | STEP010 | Windows에서 Skill file symlink fixture가 skip되어 aggregate 246/247 | file symlink `EPERM`을 `t.skip()`으로 처리했지만 acceptance가 exact pass count를 요구 | Windows junction/POSIX directory symlink fixture, skipped-zero focused/full suite gate | `reference/validation/STEP010_WINDOWS_FILE_SYMLINK_SKIP_FAILURE.md` |
| OR-ISSUE-031 | STEP010 | aggregate 실패 detail이 실제 TAP output 대신 `suite_pass` 표시 | outcome은 full marker predicate, detail은 child exit `ok`만 사용 | `suite_contract_ok` 단일 predicate와 mismatch output preservation gate | `reference/validation/STEP010_SUITE_PREDICATE_DIAGNOSTIC_MASKING.md` |
| OR-ISSUE-032 | STEP010R1 | clean 직후 focused Skill test가 dist import 실패 | compiled test가 `packages/*/dist`를 import하지만 선행 workspace build 없음 | focused test 전 deterministic build + source ordering/fresh-ZIP gate | `reference/validation/STEP010R1_FOCUSED_TEST_BUILD_PREREQUISITE.md` |

| OR-ISSUE-033 | STEP010A | architecture gate가 Accepted UI framework 이후에도 `DEFERRED`를 출력 | 최종 marker가 canonical decision을 읽지 않는 literal 문자열 | `config/ui-framework.json` canonical record + config/package/ADR/architecture coherence gate | `reference/validation/STEP010A_UI_FRAMEWORK_ARCHITECTURE_DECISION_DRIFT.md` |
| OR-ISSUE-034 | STEP010A | correct schema 7 package가 static gate에서 실패 | acceptance가 schema constant owner `migrations.ts` 대신 re-export `index.ts`에서 literal을 검색 | owner declaration + public re-export 분리 gate | `reference/validation/STEP010A_SCHEMA_OWNER_FILE_ASSERTION.md` |
| OR-ISSUE-035 | STEP010A | Windows aggregate unit failure의 실제 subtest/assertion이 report에서 사라짐 | acceptance가 전체 TAP에서 고정된 마지막 10,000자만 보존 | 첫 `not ok` TAP block+summary 위치 독립 추출과 synthetic early-failure gate | `reference/validation/STEP010A_WINDOWS_UNIT_FAILURE_EVIDENCE_TRUNCATION.md` |
| OR-ISSUE-036 | STEP010A | 동일 package의 unit file 실행 schedule이 host마다 달라질 수 있음 | canonical runner가 Node test file concurrency를 선언하지 않음 | `--test-concurrency=1`과 marker/static/full-suite gate | `reference/validation/STEP010A_UNIT_FILE_CONCURRENCY_UNDECLARED.md` |
| OR-ISSUE-037 | STEP011 | real `model.text_delta` notice rendered as unknown | STEP010A fixture durable-row shape (`eventType`, top-level fields) was treated as the live Kernel progress envelope; live shape is `{type,data}` and canonical type uses underscore | canonical live envelope projection + exact Kernel payload unit/browser gate + explicit fixture-v1 compatibility branch | `reference/validation/STEP011_LIVE_PROGRESS_ENVELOPE_VOCABULARY_DRIFT.md` |
| OR-ISSUE-038 | STEP011 | notice sequence gap could permanently skip missing frames | client advanced cursor with `max(cursor, sequence)` before proving contiguity, while replay acceptance returned the newest cursor instead of the replay base | contiguous-only advance, typed `RESYNC_REQUIRED`, snapshot reconnect, replay-base cursor unit/browser gate | `reference/validation/STEP011_NOTICE_GAP_CURSOR_ADVANCE.md` |
| OR-ISSUE-039 | STEP011 | Windows Chromium live 검증이 기능 완료 후 `agent.db-shm` 삭제 `EBUSY`로 실패 | live runner가 SQLite read-only ledger connection close 직후 전체 temp root를 one-shot `rm`하고 Windows의 지연된 WAL/SHM handle release를 허용하지 않음; browser child도 `kill()` 후 exit를 기다리지 않음 | browser/Host child exit await + `EBUSY/EPERM/ENOTEMPTY` bounded retry helper + focused injected-failure unit gate | `reference/validation/STEP011_WINDOWS_SQLITE_SHM_CLEANUP_EBUSY.md` |
| OR-ISSUE-040 | STEP011 | `finally` cleanup 예외가 앞선 browser/ledger 실패 증거를 덮을 수 있음 | cleanup block이 primary exception 존재 여부와 무관하게 직접 throw 가능한 작업을 수행 | primary failure capture, cleanup failure aggregation, primary failure 보존 marker, no-mask static/unit gate | `reference/validation/STEP011_CLEANUP_ERROR_MASKS_PRIMARY_FAILURE.md` |
| OR-ISSUE-041 | STEP011R1 | STEP011 full regression이 올바른 R1 package manifest identity를 두 건 실패 처리 | regression runner가 feature identity `STEP011_CONTROL_UI_VERTICAL_SLICE`와 current release identity `STEP011R1_...`를 하나의 `STEP` 상수로 혼용 | `RELEASE_STEP` 분리, generator/verifier/manifest identity owner gate, STEP011R1 full-regression gate | `reference/validation/STEP011R1_FEATURE_RELEASE_IDENTITY_ASSERTION.md` |
| OR-ISSUE-042 | STEP011R1 | Windows real browser가 `Chromium exited -4058`로 시작 전 실패 | live runner가 platform 조건 없이 POSIX 전용 `spawn("/usr/bin/chromium")`을 사용하고 Windows Chrome/Edge/Chromium을 탐색하지 않음 | cross-platform executable resolver, explicit override, target-platform path semantics, Windows/POSIX inventory unit/full-browser gate | `reference/validation/STEP011R1_WINDOWS_CHROMIUM_POSIX_PATH_HARDCODE.md` |
| OR-ISSUE-043 | STEP011R1 | browser process creation 실패 detail이 빈 문자열로 남음 | child `error` event를 관찰하지 않고 stdout/stderr와 numeric exitCode만 수집 | spawn error capture helper, OS code/executable diagnostic, real missing-executable event test와 live static gate | `reference/validation/STEP011R1_CHROMIUM_SPAWN_ERROR_EVIDENCE_LOSS.md` |
| OR-ISSUE-044 | STEP011R2 | Chromium UI boot failure emitted only `last=false` | Chromium navigated before CDP Runtime/Log/Network listeners were attached | start at `about:blank`, enable evidence domains before `Page.navigate`, focused ordering gate | `reference/validation/STEP011R2_BROWSER_BOOTSTRAP_EVIDENCE_LOSS.md` |
| OR-ISSUE-045 | STEP011R2 | browser wait timeout collapsed distinct failures to one boolean | wait helper retained only final predicate value and no safe DOM/network snapshot | bounded structured browser evidence block with page state and synthetic timeout test | `reference/validation/STEP011R2_BROWSER_WAIT_PREDICATE_ONLY_DIAGNOSTIC.md` |
| OR-ISSUE-046 | STEP011R3 | canonical suite `144/144`가 STEP011 feature acceptance에서 실패 | additive test 후 acceptance가 이전 `138 tests / 24 files`를 하드코딩 | current suite inventory marker 정렬, feature acceptance owner gate, independent suite execution | `reference/validation/STEP011R3_ADDITIVE_UNIT_COUNT_DRIFT.md` |
| OR-ISSUE-047 | STEP011R3 | source/fresh failed-acceptance report SHA가 실행별로 달라짐 | raw vendor/live output tail에 absolute/temp path, duration, dynamic port를 저장 | stable prerequisite token, structured browser evidence extraction/normalization, source-fresh report byte-identity gate | `reference/validation/STEP011R3_FAILURE_REPORT_NONDETERMINISM.md` |
| OR-ISSUE-048 | STEP011R3 | Vue assets load but app mount fails under CSP with `EvalError` | runtime `template:` was paired with compiler-bearing `vue.global.prod.js`, whose runtime compilation used `Function` while CSP correctly denied `unsafe-eval` | h()-based render function + `vue.runtime.global.prod.js` + strict-CSP static/fake-runtime/real-browser gates | `reference/validation/STEP011R3_VUE_RUNTIME_COMPILER_CSP_MISMATCH.md` |
| OR-ISSUE-049 | STEP011R3 | Chromium evidence retains `/favicon.ico` 404 | HTML omitted an explicit icon, so Chromium made an implicit request outside the packaged asset set | packaged SVG favicon + explicit link + browser evidence gate | `reference/validation/STEP011R3_IMPLICIT_FAVICON_HTTP_FAILURE.md` |
| OR-ISSUE-050 | STEP011R3 | same-route approval deep link could remain unselected | computed value read global `location.hash` without a reactive dependency and route ref assignment remained unchanged | reactive `routeHash` owner + hashchange update + real approval deep-link gate | `reference/validation/STEP011R3_APPROVAL_DEEP_LINK_REACTIVITY.md` |
| OR-ISSUE-051 | STEP011R4 | actual Windows Chromium approval completed after the request had already expired, producing `APPROVAL_EXPIRED` | Host composition wired `execution.defaultTimeoutMs` to both `ApprovalService.timeoutMs` and `ProcessManager.defaultTimeoutMs`; the STEP011 fixture value `5000` therefore became both the process limit and the human approval TTL | add independent `execution.approvalTimeoutMs`, wire approval/process clocks separately, use 120000/5000 in the browser fixture, and enforce focused/full regression gates | `reference/validation/STEP011R4_APPROVAL_TTL_PROCESS_TIMEOUT_COUPLING.md` |
| OR-ISSUE-052 | STEP011R5 | actual Windows Chromium connected and mounted but showed `Failed to execute 'structuredClone' on 'Window': #<Object> could not be cloned.` and rendered no pending approval | protocol JSON stored in deep Vue `ref` became a reactive Proxy, then `fixtureFrom` passed it to framework-neutral projection code that called `structuredClone`; the fake Vue test used a plain non-proxying ref | use `shallowRef` for transport object graphs, replace projection `structuredClone` with Proxy-safe detached JSON-like copying, and enforce pre-fix Proxy reproduction/focused/full-browser gates | `reference/validation/STEP011R5_VUE_REACTIVE_PROXY_STRUCTURED_CLONE_FAILURE.md` |
| OR-ISSUE-053 | STEP011R6 | Windows canonical suite가 155개 assertion 성공 뒤 `process-approval-step009.test.mjs` file-level failure를 하나 추가해 156/155/1로 종료 | synchronous `ProcessManager.close()`가 child kill 뒤 close/stream quiescence를 기다리지 않아 delayed background callback이 fixture의 SQLite close 이후 transaction을 수행; R6 extractor도 직전 async-activity diagnostic을 누락 | async/idempotent ProcessManager close, Host shutdown await ordering, STEP009 bounded cleanup, delayed-child fixture, async TAP diagnostic preservation | `reference/validation/STEP011R6_WINDOWS_ASYNC_CHILD_FINALIZATION_AFTER_TEST.md` |
| OR-ISSUE-054 | STEP011R7 | actual Windows Chromium reached `#/approvals` with Vue 3.5.40, `appShell=true`, `CONNECTED`, `alert=null`, but rendered `ApprovalsNo approvals.` and no allow-once action | approval creation produced only generic `run.event(approval.requested)` while the Control UI reloads `approval.list` only on `approval.updated`; resolve/cancel/expire had the domain notice but creation did not | preserve `run.event`, publish guarded creation-time `approval.updated`, retain explicit UI domain refresh, add bounded approval-ledger failure evidence and focused/full-browser gates | `reference/validation/STEP011R7_APPROVAL_CREATION_NOTICE_MISSING.md` |
| OR-ISSUE-055 | STEP011R8 closure | actual Windows 198/198 acceptance 후 immutable source ZIP 내부 문서가 STEP010AR1 baseline과 pending 상태를 계속 표시 | pre-run package와 post-run acceptance state를 연결하는 immutable closure workflow 부재 | accepted ZIP/SHA 불변 보존 + separate closure bundle + next-step baseline/SHA/stale-wording coherence gate | `reference/validation/STEP011_POST_ACCEPTANCE_BASELINE_DOCUMENT_CLOSURE_GAP.md` |
| OR-ISSUE-056 | STEP012A | nested STEP011 regression이 canonical `176/176` 성공을 실패로 판정하고 비결정적 TAP tail을 보고 | STEP012A test 추가 뒤 historical feature runner가 중간 inventory `174`를 하드코딩했고 OR-ISSUE-046 gate가 모든 active nested runner를 포괄하지 못함 | nested runner는 현재 unit-file inventory와 TAP tests/pass equality를 계산하고 최소 accepted floor를 검사; focused recurrence source gate | `reference/validation/STEP012A_NESTED_STEP011_SUITE_INVENTORY_DRIFT.md` |
| OR-ISSUE-057 | STEP012A | STEP010 live regression이 schema 8 DB를 `schema mismatch`로 거부 | shared historical live scripts가 current state schema 상수 대신 `schemaVersion !== 7`과 marker `schema=7`을 하드코딩; OR-ISSUE-012/015 gate가 unit expectations만 덮고 live fixtures를 누락 | STEP008/009/010 shared live fixtures가 built state owner의 `OPENRILL_STATE_SCHEMA_VERSION`을 import하고 identity/marker에 동일 상수 사용; repository-wide stale schema literal gate | `reference/validation/STEP012A_HISTORICAL_LIVE_SCHEMA_LITERAL_DRIFT.md` |
| OR-ISSUE-058 | STEP012A Windows | focused/canonical/actual Chromium regression이 모두 통과한 뒤 manifest가 `declared=650 actual=650`으로 실패 | nested STEP011과 current STEP012A acceptance가 manifest에 포함된 `reference/validation/*_ACCEPTANCE_REPORT.txt`를 실행 중 덮어써 파일 수는 같고 hash만 변경; verifier는 changed path를 숨김 | report output을 excluded `.artifacts`에 격리, nested path override, packaged report pre/post SHA gate, manifest pre/post verification, changed/missing/extra bounded path diagnostics | `reference/validation/STEP012A_WINDOWS_PACKAGE_MANIFEST_POST_REGRESSION_MUTATION.md` |
| OR-ISSUE-059 | STEP012B local acceptance | historical manifest diagnostic fixture가 current verifier identity 전에 실패 | STEP012AR1 test fixture가 temporary manifest의 step/version을 `0.12.1-step012ar1`로 하드코딩하여 STEP012B verifier와 identity mismatch; B literal 치환도 다음 release에서 재발 | fixture가 current `PACKAGE_MANIFEST.json` identity를 소유하고 literal release identity 0을 검사; focused/canonical/static gate | `reference/validation/STEP012B_HISTORICAL_MANIFEST_FIXTURE_IDENTITY_DRIFT.md` |
| OR-ISSUE-060 | STEP012B repeated focused acceptance | 10개 Host scheduler assertion 성공 뒤 file-level async failure가 추가되고 삭제된 profile의 `host.json.tmp -> host.json` rename이 ENOENT | readiness가 unowned void async task였고 Host close가 readiness delay/task 및 metadata write를 기다리지 않은 채 metadata/lock/root cleanup을 허용; close-before-ready의 ready rejection도 내부 관찰 없음 | owned/cancellable readiness task, serialized metadata write tail, close quiescence before removal/release, deterministic long-delay close-before-ready fixture and TAP async-activity gate | `reference/validation/STEP012B_HOST_READINESS_METADATA_WRITE_AFTER_CLOSE.md` |
| OR-ISSUE-061 | STEP012B Windows | scheduler/canonical/Vue/actual Chromium이 모두 통과했지만 nested STEP011이 root 문서 10건을 실패로 판정 | historical STEP011 runner가 mutable root baseline/next 문서를 소유하며 `STEP011_CONTROL_UI_VERTICAL_SLICE`와 `STEP012_AUTOMATION_SCHEDULER`를 강제; current STEP012B acceptance와 중복·충돌 | historical runner는 current RELEASE_STEP/VERSION 및 retained STEP011 history/current-claim-zero만 검사하고 current release runner가 baseline/next를 단독 소유; 4/4 focused gate | `reference/validation/STEP012B_WINDOWS_HISTORICAL_ACCEPTANCE_BASELINE_OWNERSHIP_DRIFT.md` |
| OR-ISSUE-062 | STEP012C implementation audit | schema 9 current package would be rejected or misparsed by historical STEP011/STEP012 regression despite valid product execution | OR-ISSUE-057 covered STEP008/009/010 only; STEP011 actual Chromium and later historical Python runners retained schema 8 literals and treated historical release schema as current State ownership | STEP011 live imports `OPENRILL_STATE_SCHEMA_VERSION`; all active historical runners derive current `SCHEMA` from State source and interpolate nested markers; current STEP012C alone owns exact schema 9/migration 009 gate | `reference/validation/STEP012C_HISTORICAL_SCHEMA_OWNER_SCOPE_GAP.md` |
| OR-ISSUE-063 | STEP012C timeout investigation | outer nested runs exceeded buffered tool-call bounds; this did not prove a Vue stall, but code audit independently found exact Vue acquisition had no deadline | `vendor-vue-runtime.mjs` used `fetch()` without AbortSignal/deadline; byte bounds applied only after response progress | 15-second `AbortSignal.timeout` around exact download, stable runtime_unavailable classification, source/unit recurrence gate | `reference/validation/STEP012C_UNBOUNDED_VUE_ACQUISITION_WAIT.md` |
| OR-ISSUE-064 | STEP012C nested AR1/B | historical AR1/B retained mutable root-document ownership; AR1 produced 15 concrete failures after BR1 promotion and STEP012C selection | AR1 runner still owned mutable current accepted step/SHA/current feature across five root docs | retain immutable AR1/STEP012A history only; current release acceptance exclusively owns current accepted baseline/SHA/feature | `reference/validation/STEP012C_HISTORICAL_ACCEPTED_BASELINE_DOCUMENT_OWNERSHIP_DRIFT.md` |
| OR-ISSUE-065 | STEP012C nested B/BR1 | historical STEP012B failed Host composition/fail-closed source checks after production executor integration | B gate asserted temporary deferred syntax and message instead of durable executor-selection/fail-closed invariant | invariant-based injected-or-production executor composition gate; scheduler package decoupling retained | `reference/validation/STEP012C_HISTORICAL_DEFERRED_EXECUTOR_COMPOSITION_DRIFT.md` |
| OR-ISSUE-066 | STEP012C Windows | STEP012A/B/C focused와 canonical이 통과했지만 nested STEP012BR1이 외부 Vue 재획득 실패로 `runtime_unavailable` 종료 | backend-only STEP012C가 accepted historical browser chain을 unconditional 재실행했고 STEP011 runner가 매번 exact Vue tarball을 network에서 다시 획득; browser surface는 accepted BR1과 byte-identical이고 live delta는 schema-owner 두 줄뿐 | immutable accepted browser evidence + six-file SHA/no-impact gate + schema-owner-normalized live hash + honest `ACCEPTED_BASELINE_NO_IMPACT` marker; actual Chromium ownership은 UI 변경 STEP012D로 복귀 | `reference/validation/STEP012C_WINDOWS_HISTORICAL_BROWSER_RUNTIME_OWNERSHIP.md` |
| OR-ISSUE-067 | STEP012D preflight | unrelated Automation edit shifted interval schedule anchor | UI serialized a new `anchorMs=Date.now()` in every full update patch | preserve existing anchor when period is unchanged; focused source gate and Windows ledger assertion | `reference/validation/STEP012D_AUTOMATION_INTERVAL_ANCHOR_EDIT_DRIFT.md` |
| OR-ISSUE-068 | STEP012D canonical | historical STEP012B/CR1 tests rejected the intentional Automation UI owner cutover | temporary deferred/no-impact assertions inspected current UI after STEP012D became actual browser owner | historical tests retain package/accepted-evidence invariants; no-impact verifier must fail closed; STEP012D owns actual Chromium | `reference/validation/STEP012D_HISTORICAL_BROWSER_OWNER_CUTOVER_DRIFT.md` |
| OR-ISSUE-069 | STEP012D canonical | historical STEP012BR1 test required current root documents to remain STEP012C/BR1/STEP011 text | historical test mixed mutable current-document ownership with immutable accepted evidence | current root docs validate STEP012D/STEP012CR1; BR1 and STEP011 markers remain in dedicated accepted-evidence docs | `reference/validation/STEP012D_HISTORICAL_ROOT_DOCUMENT_EXPECTATION_DRIFT.md` |
| OR-ISSUE-070 | STEP012D preflight | replay button could be satisfied by Local Protocol memory cache instead of schema-9 durable run replay | UI reused durable requestKey as Protocol envelope idempotency key | separate transport idempotency from durable request identity; actual browser requires one ledger run and one model request | `reference/validation/STEP012D_PROTOCOL_IDEMPOTENCY_MASKS_DURABLE_MANUAL_REPLAY.md` |
| OR-ISSUE-071 | STEP012D acceptance | accepted STEP012CR1 version in README was falsely classified as stale current candidate | context-free stale scan conflated immutable accepted history with current ownership | positive current STEP/version checks plus stale scan scoped only to explicit old current-candidate claims | `reference/validation/STEP012D_ACCEPTED_BASELINE_VERSION_STALE_FALSE_POSITIVE.md` |
| OR-ISSUE-072 | STEP012D Windows | canonical suite 후 actual Chromium이 `browser wait timeout: Automation UI connected`로 종료 | live fixture가 첫 Host metadata(`LISTENING/readiness=false`)를 usable로 반환했고 UI가 bootstrap fetch/connect/projection 실패를 하나의 connection FAILED로 축약; 전체 Windows page evidence는 제공되지 않아 exact subphase는 미확정 | shared READY-only metadata helper, STEP011/STEP012D fixture 정렬, phased UI startup, startupPhase/browser/startup evidence, CONNECTED+READY wait, 8/8 focused gate | `reference/validation/STEP012D_WINDOWS_UI_CONNECTION_WAIT_BEFORE_HOST_READY_AND_PHASE_COLLAPSE.md` |
| OR-ISSUE-073 | STEP012DR1 local acceptance | focused 통과 뒤 canonical 218개 중 root ownership test 1건이 R1 문서를 거부 | historical test가 retained STEP012D feature identity와 current corrective release identity를 동일 literal로 취급; active historical runners도 old release literal 유지 | current release는 PACKAGE_MANIFEST에서 동적 파생, retained feature/accepted evidence 별도 assertion, active historical release identity 정렬 | `reference/validation/STEP012DR1_HISTORICAL_FEATURE_AND_CURRENT_RELEASE_IDENTITY_CONFLATION.md` |
| OR-ISSUE-074 | STEP012DR1 Windows | Host READY와 bootstrap 200 후 actual Chromium이 Vue runtime 404/MIME 거부로 `Automation UI ready` timeout | exact Vue는 임시 vendor root에 획득했지만 workspace build는 그 전에 vendor 환경 없이 실행; `workspace-runner.mjs`는 build 시에만 `dist/public/vendor`를 생성하고 live env 전달만으로 Host static root가 갱신되지 않음 | acquired vendor 이후 vendor-aware rebuild, dist 3파일 byte equality, Chromium 전 Host-served runtime/lock HTTP status/MIME/hash preflight, bounded static evidence, focused 4/4 | `reference/validation/STEP012DR1_WINDOWS_VUE_VENDOR_NOT_MATERIALIZED_IN_STATIC_ROOT.md` |
| OR-ISSUE-075 | STEP012DR2 Windows | canonical suite의 background process tail assertion이 `/ready/` 대신 빈 문자열을 받아 221/222 실패하고 Chromium aggregate가 `canonical_suite_failed`로 차단 | `run(background=true)`는 spawn/RUNNING까지만 보장하는데 STEP009 test가 fixed 100ms 뒤 stdout flush 완료를 가정; Windows child/pipe/file flush가 늦으면 정상 RUNNING process의 첫 tail은 empty | fixed sleep 제거, active-status-aware bounded tail polling, 250ms delayed-first-output fixture, timeout status/tail evidence, focused actual/static/repeated gates | `reference/validation/STEP012DR2_WINDOWS_BACKGROUND_PROCESS_STDOUT_FIXED_SLEEP_RACE.md` |
| OR-ISSUE-076 | STEP012DR3 Windows | actual Chromium history text showed one SUCCEEDED MANUAL run but live fixture counted rows=2 and failed 170/171 | broad `[data-testid^="automation-run-"]` selector matched both `automation-run-now` action and the single `automation-run-<id>` row | isolate history rows under `automation-history-row-*`, reject broad prefix selector, retain exact SQLite one-run/provider-one-call gates | `reference/validation/STEP012DR3_WINDOWS_AUTOMATION_HISTORY_SELECTOR_PREFIX_COLLISION.md` |
| OR-ISSUE-077 | STEP012DR4 accepted audit | all 26 manifests identified `0.12.10-step012dr4` but 25 source package identities and Host runtime literals still reported `0.12.7-step012dr1` | release tooling updated manifests/documents but did not own source-level current identity | align all source/package/Host literals in STEP013A and add repository-wide source-version verifier | `reference/validation/STEP012DR4_ACCEPTED_SOURCE_VERSION_IDENTITY_DRIFT.md` |
| OR-ISSUE-078 | STEP013A pre-package audit | missing Browser driver precondition was initially checked after profile lock and SQLite initialization | new Browser composition validation was placed near construction rather than the pre-lock argument gate | move preflight before `acquireHostLock`, add static ordering and focused Host failure gate | `reference/validation/STEP013A_BROWSER_DRIVER_PREFLIGHT_AFTER_STATE_LOCK_NEAR_MISS.md` |
| OR-ISSUE-079 | STEP013A focused test | never-resolving Browser driver caused Node test cancellation instead of bounded launch timeout | awaited timeout timer was `unref()`ed and adapter Promise was not raced against an explicit rejection | referenced timeout race, AbortSignal propagation, `BROWSER_LAUNCH_TIMEOUT` mapping and never-resolving-driver test | `reference/validation/STEP013A_BROWSER_TIMEOUT_UNREF_LIVENESS_FAILURE.md` |
| OR-ISSUE-080 | STEP013A focused test | Host shutdown test raised `TypeError: disposeRelease is not a function` | validation inferred Browser disposal entry from generic event-loop turns | explicit `disposeStarted` and release barriers; Host close must remain pending between them | `reference/validation/STEP013A_HOST_SHUTDOWN_TEST_TURN_ASSUMPTION.md` |
| OR-ISSUE-081 | STEP013A | Browser config 추가 후 historical Host fixture가 `browser`를 누락하고 shutdown test가 과거 direct ProcessManager close 순서를 고정 | 수동 materialized config와 정적 drain assertion이 additive Host lifecycle 계약을 따라가지 못함 | 완전한 disabled Browser config fixture + Browser/Process 병렬 drain 뒤 SQLite close gate + full canonical | `reference/validation/STEP013A_HISTORICAL_HOST_FIXTURE_BROWSER_CONFIG_AND_DRAIN_EXPECTATION_DRIFT.md` |
| OR-ISSUE-082 | STEP013A | historical root ownership test가 DR4 승격 후에도 STEP012D/STEP012CR1 101/101을 모든 current 문서에 강제 | current candidate, latest accepted baseline, immutable historical evidence 소유권을 혼동 | root는 current+latest DR4만 소유하고 CR1/BR1/STEP011은 dedicated evidence에서 검증 | `reference/validation/STEP013A_HISTORICAL_ROOT_ACCEPTED_BASELINE_CUTOVER_OWNERSHIP_DRIFT.md` |
| OR-ISSUE-083 | STEP013A | Windows acceptance rewrote `pnpm-lock.yaml` before both manifest gates | Host `package.json` added `@openrill/browser-runtime`, but the Host lock importer retained the prior dependency set; pnpm run dependency verification implicitly installed and repaired it | exact all-workspace manifest/importer verifier, corrected Host importer, `verifyDepsBeforeRun=error`, negative fixture, initial/final manifest gates | `reference/validation/STEP013A_WINDOWS_WORKSPACE_LOCK_IMPORTER_DRIFT.md` |
| OR-ISSUE-084 | STEP013AR1 | retained STEP013A boundary test rejected corrective version | current release identity was hardcoded to `0.13.0-step013a` instead of derived from the current manifest | derive current version from root package while retaining STEP013A feature assertions separately | `reference/validation/STEP013AR1_HISTORICAL_FEATURE_CURRENT_RELEASE_VERSION_ASSERTION_DRIFT.md` |
| OR-ISSUE-085 | STEP013AR1 | local canonical suite loaded duplicate package classes and failed unrelated paths | copied validation workspace reused absolute `node_modules/@openrill/*` links targeting the previous worktree | current-root workspace-link verifier and isolated link materialization before tests | `reference/validation/STEP013AR1_LOCAL_WORKSPACE_MODULE_LINK_CROSS_ROOT_CONTAMINATION.md` |
| OR-ISSUE-086 | STEP013AR1 | Windows pnpm install 후 root `node_modules/@openrill`이 없어 module-link gate가 정상 layout을 거부 | verifier가 root scope existence를 workspace resolution 계약으로 오인 | importer별 internal dependency resolution, optional root scope, package-local positive/outside-root negative fixtures | `reference/validation/STEP013AR1_WINDOWS_ROOT_WORKSPACE_SCOPE_LAYOUT_ASSUMPTION.md` |
| OR-ISSUE-087 | STEP013AR2 | source/fresh acceptance both passed but report SHA differed by root-scope layout detail | successful aggregate detail embedded physical scope/materialized/root_scope diagnostics | stable success detail, full verifier output only on failure, cross-layout report equality gate | `reference/validation/STEP013AR2_SUCCESS_REPORT_PHYSICAL_LAYOUT_DETAIL_DRIFT.md` |
| OR-ISSUE-088 | STEP013AR2 | Windows `pnpm acceptance:step013ar2`가 stage 표시 없이 대기 | aggregate가 child stdout을 종료까지 보관하고 모든 `subprocess.run`에 timeout이 없어 slow/deadlocked stage를 식별·종료할 수 없음 | flushed stage start/heartbeat/end, explicit timeouts, Windows/POSIX process-tree termination, timeout evidence, pruned cleanup scans | `reference/validation/STEP013AR2_WINDOWS_ACCEPTANCE_SILENT_UNBOUNDED_STAGE_WAIT.md` |
| OR-ISSUE-089 | STEP013AR3 | Windows stage-runner timeout fixture failed `ModuleNotFoundError: scripts.acceptance_stage_runner` | `python -c` fixture depended on current root being implicitly present on Python import path | explicit helper file loading via `importlib`, unrelated cwd and safe-path fixture, focused/full-suite gates | `reference/validation/STEP013AR3_WINDOWS_STAGE_RUNNER_FIXTURE_IMPORT_PATH_DEPENDENCY.md` |
| OR-ISSUE-090 | STEP013B1 | Host build failed reading `.executable` through provider-neutral `BrowserDriver` | concrete Playwright value was widened before adapter metadata read | read metadata on concrete local, then widen; adapter-boundary compile/static gate | `reference/validation/STEP013B1_PROVIDER_NEUTRAL_DRIVER_METADATA_WIDENING.md` |
| OR-ISSUE-091 | STEP013B1 | normally closed Playwright process remained in driver ownership set | set deletion existed only in detached disconnect listener | idempotent handle retirement on disconnect and close-finally; active-count gate | `reference/validation/STEP013B1_PLAYWRIGHT_PROCESS_RETENTION_AFTER_NORMAL_CLOSE.md` |
| OR-ISSUE-092 | STEP013B1 | aborted launch could later resolve without an owner and leak Chromium | abort race did not clean the original still-running launch Promise | late-launch close continuation, post-race abort guard, orphan-zero gate | `reference/validation/STEP013B1_LATE_PLAYWRIGHT_LAUNCH_AFTER_ABORT_ORPHAN_RISK.md` |
| OR-ISSUE-093 | STEP013B1 | canonical test forced mutable root docs to keep STEP012DR4 after STEP013AR4 acceptance | historical evidence ownership test froze a replaceable latest-baseline slot | promote mutable root assertion to STEP013AR4 while retaining dedicated older evidence | `reference/validation/STEP013B1_LATEST_ACCEPTED_BASELINE_HISTORICAL_TEST_FREEZE.md` |
| OR-ISSUE-094 | STEP013B1 | exact lock verifier passed 27 importers but unit test required 26 | current workspace inventory was duplicated as a literal | derive manifest count and compare with verifier output | `reference/validation/STEP013B1_WORKSPACE_IMPORTER_COUNT_HARDCODE_DRIFT.md` |
| OR-ISSUE-095 | STEP013B1 | Browser live failure exposed only generic `browser launch failed` | provider-neutral wrapper discarded adapter code/message from public Tool diagnostics | retain neutral code but include bounded adapter failure detail; focused diagnostic gate | `reference/validation/STEP013B1_ADAPTER_LAUNCH_CAUSE_DIAGNOSTIC_MASKING.md` |
| OR-ISSUE-096 | STEP013B1 Windows | 31/31 focused tests passed but aggregate reported four failures | TAP-only predicate consumed platform-default Windows spec reporter because four commands omitted `--test-reporter=tap` | explicit TAP in predecessor/current runners, standalone summary fixture, command ownership gate | `reference/validation/STEP013B1_WINDOWS_FOCUSED_TEST_DEFAULT_REPORTER_FALSE_NEGATIVE.md` |
| OR-ISSUE-097 | STEP013B1A focused fixture | nested `node --test` exited 0 but stdout was empty | inherited `NODE_TEST_CONTEXT=child-v8` routed reporter through parent protocol instead of standalone stdout | remove only NODE_TEST_CONTEXT in nested CLI fixture and assert TAP stdout | `reference/validation/STEP013B1A_NESTED_NODE_TEST_CONTEXT_REPORTER_CAPTURE.md` |
| OR-ISSUE-113 | STEP013C canonical | mutable root docs omitted accepted `134/134` identity | STEP013C rewrite copied accepted step/SHA but not checks into README/PLANS | dynamic baseline-record gate requires step/checks/SHA in all five root docs | `reference/validation/STEP013C_ROOT_DOCUMENT_ACCEPTED_CHECK_IDENTITY_OMISSION.md` |
| OR-ISSUE-114 | STEP013C Windows restart | second Automation attempt failed before execution with generic conversation failure | recovery cleared `current_attempt_id` after aborting attempt 1, but `executeAgentRun()` requires `executionContext()` before `startExecution()` can create attempt 2 | retain the ABORTED/HOST_RESTART attempt pointer until deterministic rollover; real executeAgentRun recovery gate | `reference/validation/STEP013CR1_RESTART_ATTEMPT_POINTER_CONTRACT_MISMATCH.md` |
| OR-ISSUE-115 | STEP013C Windows diagnostics | exact Conversation recovery error and SQLite state were lost behind a generic code and cleanup | Automation executor discarded typed ConversationError and live fixture deleted temporary DB after assertion | typed `AUTOMATION_CONVERSATION_<CODE>` mapping plus privacy-safe pre-cleanup DB diagnostic snapshot | `reference/validation/STEP013CR1_TYPED_RECOVERY_DIAGNOSTIC_PRESERVATION.md` |
| OR-ISSUE-116 | STEP013CR1 canonical | historical STEP006 test required recovered `current_attempt_id=NULL` | test froze the defective representation that caused the Windows restart failure | assert attached ABORTED/HOST_RESTART attempt and distinct attempt 2 rollover | `reference/validation/STEP013CR1_HISTORICAL_RECOVERY_TEST_NULL_POINTER_FREEZE.md` |
| OR-ISSUE-117 | STEP013CR1 local live prerequisite | Browser ledger assertion printed raw conversation message JSON into acceptance log | diagnostic assertion queried `conversation_messages.content_json` and interpolated it | metadata-only operation status/error assertion; source gate rejects raw message query | `reference/validation/STEP013CR1_LIVE_ASSERTION_RAW_MESSAGE_DISCLOSURE.md` |
| OR-ISSUE-118 | STEP013CR1 Windows browser-live | actual interrupted invocation values matched but deep equality failed on `[Object: null prototype]` | live fixture compared a Node SQLite row to an ordinary object literal with prototype-sensitive deep equality | assert exact owned fields through a prototype-neutral helper; null-prototype behavioral and source gates | `reference/validation/STEP013CR2_SQLITE_NULL_PROTOTYPE_ASSERTION_ALIGNMENT.md` |
| OR-ISSUE-119 | STEP013CR2 local aggregate | runner raised `KeyError: focused-sqlite-row-assertion` after the test passed | new external stage was added without a matching `STAGE_TIMEOUTS` entry | bounded 120-second timeout plus stage/timeout co-ownership gate | `reference/validation/STEP013CR2_FOCUSED_STAGE_TIMEOUT_INVENTORY_OMISSION.md` |
| OR-ISSUE-120 | STEP013CR2 local aggregate | three static/predicate checks failed although their underlying focused tests passed | acceptance predicates inspected stale owner/location or shared an incorrect expected count | inspect current owner, match actual stage command line, and keep suite counts independently owned | `reference/validation/STEP013CR2_ACCEPTANCE_PREDICATE_OWNERSHIP_ALIGNMENT.md` |
| OR-ISSUE-121 | STEP013CR2 final package seal | current source ZIP manifest was labeled STEP013B3/0.13.8 | manifest generator and verifier retained accepted-baseline literals and validated each other | current package identity in generator/verifier/manifest; accepted baseline remains separate config | `reference/validation/STEP013CR2_CURRENT_PACKAGE_MANIFEST_IDENTITY_FREEZE.md` |
| OR-ISSUE-122 | STEP014A focused total-token enforcement | typed total-token failure path was replaced by SQLite CHECK failure | budget envelope required observed usage to remain below configured ceiling, so provider-reported overshoot could not be persisted | keep observed usage non-negative but not ceiling-constrained in SQLite; service/kernel enforce and preserve typed failure evidence | `reference/validation/STEP014A_BUDGET_OVERSHOOT_EVIDENCE_CONSTRAINT.md` |
| OR-ISSUE-123 | STEP014A restart usage audit | two one-turn attempts aggregated to one Run turn | Run-wide turn query used `MAX(used_turns)` unlike token/model/tool SUM aggregation | SUM turn usage across attempts and verify exact aggregate after restart-style attempt split | `reference/validation/STEP014A_RESTART_ATTEMPT_TURN_AGGREGATION.md` |
| OR-ISSUE-124 | STEP014A canonical | retained STEP013C/CR2 tests rejected valid schema 12/current STEP014A identity | historical tests owned mutable current schema and package identity | historical tests own retained migration/behavior; current STEP owns exact current schema/identity | `reference/validation/STEP014A_HISTORICAL_CURRENT_IDENTITY_OWNERSHIP_DRIFT.md` |
| OR-ISSUE-125 | STEP014A canonical Browser/Automation | SQLite parameter 9 rejected undefined budget values | legacy JavaScript/internal callers omitted newly added maxTotalTokens/maxDurationMs | normalize durable defaults at Conversation boundary before persistence and comparison | `reference/validation/STEP014A_LEGACY_EXECUTION_BUDGET_DEFAULT_ALIGNMENT.md` |
| OR-ISSUE-126 | STEP014A canonical recovery/Automation | deterministic-clock Runs immediately failed time budget | Conversation deadline used injected clock while Kernel checked process Date.now | Kernel uses explicit or Conversation-owned clock domain | `reference/validation/STEP014A_DURABLE_DEADLINE_CLOCK_DOMAIN_ALIGNMENT.md` |
| OR-ISSUE-127 | STEP014A first aggregate | acceptance runner failed before stages with missing `packages/tool-runtime/src/registry.ts` | static predicate assumed a concrete Tool Runtime implementation filename that does not exist | derive and scan the actual `packages/tool-runtime/src/*.ts` inventory; existence and anti-literal recurrence gate | `reference/validation/STEP014A_ACCEPTANCE_RUNNER_SOURCE_INVENTORY_ALIGNMENT.md` |
| OR-ISSUE-128 | STEP014A first aggregate | canonical command depended on literal `tests/unit/*.test.mjs` | direct subprocess argument lists do not own shell wildcard expansion | sorted `pathlib` test inventory expanded into explicit Node arguments; no-wildcard recurrence gate | `reference/validation/STEP014A_CANONICAL_TEST_FILE_ENUMERATION.md` |
| OR-ISSUE-129 | STEP014B | parent in-memory usage could lag child budget reservation | usage was not persisted immediately before Tool dispatch | durable model usage update and pre-dispatch Tool usage update | `reference/validation/STEP014B_OR_ISSUE_129.md` |
| OR-ISSUE-130 | STEP014B | delegated child could run with global default budget | Kernel ignored an existing child budget envelope | durable envelope is the execution budget source and conflicts fail closed | `reference/validation/STEP014B_OR_ISSUE_130.md` |
| OR-ISSUE-131 | STEP014B | child model and dispatcher could access Tools outside stored scope | global ToolRegistry was exposed independently from budget scope | schema filtering plus `AGENT_TOOL_NOT_ALLOWED` dispatch gate | `reference/validation/STEP014B_OR_ISSUE_131.md` |
| OR-ISSUE-132 | STEP014B | parent result could not be delivered exactly once | wait projection lacked parent attempt/Tool call/delivery identity | schema 13 delivery ledger, deterministic Tool result and checkpoint | `reference/validation/STEP014B_OR_ISSUE_132.md` |
| OR-ISSUE-133 | STEP014B | historical STEP014A tests rejected additive schema/Tools | historical ownership froze mutable current state | migration/minimum and historical-document gates; exact current ownership in B | `reference/validation/STEP014B_OR_ISSUE_133.md` |
| OR-ISSUE-134 | STEP014B | child could auto-activate Skills outside an empty child Skill scope | Host Skill resolver did not distinguish delegated Runs | delegated Runs use default instructions with no Skill activation | `reference/validation/STEP014B_OR_ISSUE_134.md` |
| OR-ISSUE-135 | STEP014B | terminal child could race wait registration and return an error | result check and wait registration were separate transactions | terminal re-read on state conflict; immediate-result and wait tests | `reference/validation/STEP014B_OR_ISSUE_135.md` |
| OR-ISSUE-136 | STEP014B first clean aggregate | Host could not resolve `@openrill/tools-delegation` after all dist directories were removed | new workspace existed in manifests/lock but was omitted from root TypeScript project references | add ordered root project reference and zero-dist clean-build gate | `reference/validation/STEP014B_OR_ISSUE_136.md` |
| OR-ISSUE-137 | STEP014C | retained STEP014B tests rejected schema 14 | historical test owned mutable current schema 13 | retain migration 013/minimum schema ownership; exact schema 14 belongs to STEP014C | `reference/validation/STEP014C_OR_ISSUE_137.md` |
| OR-ISSUE-138 | STEP014C | descendant use did not reduce parent total budgets | parent envelope tracked own usage only | delegated usage counters and composite Kernel enforcement | `reference/validation/STEP014C_OR_ISSUE_138.md` |
| OR-ISSUE-139 | STEP014C | reservation release and parent charge were not exactly once | active reservation was inferred without a durable release row | schema 14 RESERVED/RELEASED ledger and atomic actual-use charge | `reference/validation/STEP014C_OR_ISSUE_139.md` |
| OR-ISSUE-140 | STEP014C | child could never use durable nested capacity | public spawn forced child delegation capacity and Tools to zero | bounded `maxNestedDepth` and inherited delegation Tool scope | `reference/validation/STEP014C_OR_ISSUE_140.md` |
| OR-ISSUE-141 | STEP014C | parent cancellation left descendant resources active | cancel hook owned one Run only | deepest-first descendant resource cancellation and terminalization | `reference/validation/STEP014C_OR_ISSUE_141.md` |
| OR-ISSUE-142 | STEP014C | child deadline did not create terminal delivery | no Host deadline orchestration owner | bounded sweep and typed timeout path | `reference/validation/STEP014C_OR_ISSUE_142.md` |
| OR-ISSUE-143 | STEP014C | terminal child result could be lost across restart | completion callback was in-memory only | startup terminal-child reconciliation through idempotent delivery | `reference/validation/STEP014C_OR_ISSUE_143.md` |
| OR-ISSUE-144 | STEP014C | recovered CREATED child stayed unscheduled | startup did not enumerate runnable delegated Runs | startup reschedule excluding active delegation waits | `reference/validation/STEP014C_OR_ISSUE_144.md` |
| OR-ISSUE-145 | STEP014C | terminal reconciliation SQL had ambiguous `status` | joined tables shared the unqualified column name | fully qualified delegation join projection and reopen tests | `reference/validation/STEP014C_OR_ISSUE_145.md` |
| OR-ISSUE-146 | STEP014D | retained B/C tests rejected intentional delegation Protocol/UI cutover | temporary no-surface exclusions were encoded as permanent current-state assertions | preserve historical plans and let STEP014D own exact current surface | `reference/validation/STEP014D_OR_ISSUE_146.md` |
| OR-ISSUE-147 | STEP014D | retained C test rejected current version and manifest identity | mutable current identity was frozen at 0.14.2-step014c | derive mutable identity from root and retain C identity only in immutable plan | `reference/validation/STEP014D_OR_ISSUE_147.md` |
| OR-ISSUE-148 | STEP014D | public control surface risked exposing internal task/event data | raw repository/event rows were not a public contract | dedicated bounded privacy-safe projection | `reference/validation/STEP014D_OR_ISSUE_148.md` |
| OR-ISSUE-149 | STEP014D | operator cancel could omit descendant resources or duplicate terminal events | a new Protocol cancellation path could diverge from STEP014C cleanup | reuse deepest-first subtree terminalization and idempotent replay | `reference/validation/STEP014D_OR_ISSUE_149.md` |
| OR-ISSUE-150 | STEP014D | flat creation ordering did not represent the delegation graph | UI list lacked relation traversal | parent/child preorder with seen guard and depth markers | `reference/validation/STEP014D_OR_ISSUE_150.md` |
| OR-ISSUE-151 | STEP014D | Protocol/static-bundle live check did not prove UI rendering | Chromium never executed the served application | real Chromium route/tree/detail validation and orphan check | `reference/validation/STEP014D_OR_ISSUE_151.md` |
| OR-ISSUE-152 | STEP014D | external-model failure could be attributed to an unavailable guessed model | model identity was not an explicit prerequisite | require OPENRILL_STEP014D_MODEL and no fallback | `reference/validation/STEP014D_OR_ISSUE_152.md` |
| OR-ISSUE-153 | STEP014D | historical Automation test rejected inserted delegation route | route adjacency was frozen instead of feature presence | retain Automation surface without owning current order | `reference/validation/STEP014D_OR_ISSUE_153.md` |
| OR-ISSUE-154 | STEP014D | STEP004 handshake test rejected three valid delegation capabilities | full current operation list was frozen before additive surface | update exact current list and retain Protocol v1 | `reference/validation/STEP014D_OR_ISSUE_154.md` |
| OR-ISSUE-155 | STEP014D | source-version verifier found two Host literals at 0.14.2 | bootstrap payload version was not included in initial release update | align all Host literals and retain repository-wide verifier | `reference/validation/STEP014D_OR_ISSUE_155.md` |
| OR-ISSUE-156 | STEP014D | aggregate falsely rejected valid validator and relation tree | predicates guessed error wording and equivalent source syntax | inspect owned validator bound and map-based traversal tokens | `reference/validation/STEP014D_OR_ISSUE_156.md` |
| OR-ISSUE-157 | STEP014DR1 | package manifest initial/final saw an extra prior release ZIP | immutable STEP013CR2 ZIP was copied into the exact source-root inventory | dedicated archive-free source-root preflight; no automatic deletion or ZIP exclusion | `reference/validation/STEP014DR1_OR_ISSUE_157.md` |
| OR-ISSUE-158 | STEP014DR1 | external-model root Run failed with `items=[]` but no typed cause | live fixture deleted the durable DB without reading model invocation/attempt/event metadata | privacy-safe DB diagnostic before cleanup with typed model code and message digest/length only | `reference/validation/STEP014DR1_OR_ISSUE_158.md` |
| OR-ISSUE-159 | STEP014DR1 | retained STEP014D test rejected corrective current identity | historical feature test owned mutable root version/manifest identity | historical entrypoint preservation separated from current STEP014DR1 identity ownership | `reference/validation/STEP014DR1_OR_ISSUE_159.md` |
| OR-ISSUE-160 | STEP014DR1 | retained STEP014C test rejected current STEP014DR1 manifest identity | historical test transferred mutable STEP ownership permanently to STEP014D | preserve STEP014C plan/version only; current generators follow root package owner | `reference/validation/STEP014DR1_OR_ISSUE_160.md` |
| OR-ISSUE-161 | STEP014DR2 | first external OpenAI model request failed `MODEL_INVALID_REQUEST` before delegation | dotted canonical Tool names were sent directly into the provider function-name field | deterministic provider-safe aliases with canonical reverse mapping | `reference/validation/STEP014DR2_OR_ISSUE_161.md` |
| OR-ISSUE-162 | STEP014DR2 | naive dot replacement could collide or drift across turns | alias identity depended on neighboring Tools instead of canonical identity | SHA-derived stable aliases, history projection, collision/unknown-alias fail-closed gates | `reference/validation/STEP014DR2_OR_ISSUE_162.md` |
| OR-ISSUE-163 | STEP014DR2 | retained STEP014DR1 boundary rejected the new current version | historical correction evidence and mutable release identity shared one assertion | preserve DR1 plan/entrypoints; current STEP owns exact root identity | `reference/validation/STEP014DR2_OR_ISSUE_163.md` |
| OR-ISSUE-164 | STEP014DR3 | OpenAI Responses emitted duplicate/blank Tool calls | one provider call was split between `call_id` and `item_id` accumulators | bidirectional identity binding and mixed-ID parallel SSE regression | `reference/validation/STEP014DR3_OR_ISSUE_164_OPENAI_ITEM_CALL_ID_ACCUMULATOR_SPLIT.md` |
| OR-ISSUE-165 | STEP014DR3 | empty provider Tool name reached Tool Runtime as `tool not found: ` | terminal flush did not require canonical name completion | adapter-owned empty-name fail-closed gate | `reference/validation/STEP014DR3_OR_ISSUE_165_EMPTY_PROVIDER_TOOL_NAME_RUNTIME_ESCAPE.md` |
| OR-ISSUE-166 | STEP014DR3 | Tool failure diagnostics omitted the Tool identity already present in durable events | diagnostic projection retained event type only | privacy-safe recent Tool event projection without payload/arguments/results | `reference/validation/STEP014DR3_OR_ISSUE_166_TOOL_FAILURE_DIAGNOSTIC_IDENTITY_GAP.md` |
| OR-ISSUE-167 | STEP014DR3 | retained DR2 boundary rejected the DR3 current version | historical entrypoint retention also asserted mutable root version | immutable DR2 plan/script gate plus current release owner separation | `reference/validation/STEP014DR3_OR_ISSUE_167_HISTORICAL_DR2_CURRENT_VERSION_FREEZE.md` |

## STEP014DR4
- OR-ISSUE-168 — Default child reservation contradicted parallel fan-out.
- OR-ISSUE-169 — Typed Tool error code absent from live diagnostics.
- OR-ISSUE-170 — Terminal root structural mismatch waited until live timeout.
- OR-ISSUE-171 — Historical diagnostics exact-object freeze.

- OR-ISSUE-172 — Historical checkpoint exact-object freeze.

## STEP014DR5
| Issue | Step | Symptom | Root cause | Prevention | Evidence |
|---|---|---|---|---|---|
| OR-ISSUE-173 | STEP014DR5 | completed nested delegation failed on Control UI asset 404 | live fixture hardcoded `/assets/app.js` while index/build own `/assets/web/browser-app.js` | shared entrypoint contract, served-index discovery, canonical static route test, no compatibility alias | `reference/validation/STEP014DR5_OR_ISSUE_173.md` |

- OR-ISSUE-174 — Stochastic nested Tool choice frozen into external-model acceptance — CLOSED in STEP014DR6.
- OR-ISSUE-175 — External-model and nested Control UI evidence coupled in one live stage — CLOSED in STEP014DR6.

## STEP014DR7
| Issue | Step | Symptom | Root cause | Prevention | Evidence |
|---|---|---|---|---|---|
| OR-ISSUE-176 | STEP014DR7 | deterministic nested UI live failed inside Node `undici` with `assert(!this.paused)` | Control UI module response status was checked without consuming the body before cleanup | bounded `node:http` client, complete drain, module-content assertion | `reference/validation/STEP014DR7_OR_ISSUE_176.md` |
| OR-ISSUE-177 | STEP014DR7 | live fixtures repeatedly exposed transport/lifecycle-specific false negatives | loopback HTTP timeout, byte, drain and diagnostic ownership was fragmented across fixtures | shared loopback client plus machine lifecycle audit | `reference/validation/STEP014DR7_OR_ISSUE_177.md` |
| OR-ISSUE-178 | STEP014DR7 | loaded canonical run could skip the first Browser predicate attempt and report the wrong diagnostic state | deadline was checked before any predicate attempt | guarantee one initial attempt before deadline-controlled retries | `reference/validation/STEP014DR7_OR_ISSUE_178.md` |
| OR-ISSUE-179 | STEP014DR7 | retained DR5 entrypoint test rejected the bounded loopback client | gate froze `await Response.text()` syntax instead of served-index discovery | semantic entrypoint-discovery gate permits already-consumed bounded text | `reference/validation/STEP014DR7_OR_ISSUE_179.md` |
| OR-ISSUE-180 | STEP014DR7 | monolithic canonical process could progress without returning the final aggregate marker | all unit files, output and open-handle finalization were owned by one child | bounded ordered canonical child batches with exact aggregate totals | `reference/validation/STEP014DR7_OR_ISSUE_180.md` |
| OR-ISSUE-181 | STEP014DR7 | a bounded canonical batch still stopped after passing tests without returning its TAP summary | multiple files still shared one Node child and therefore shared open handles/global state; loopback failures could also reject before request close | one Node child and timeout per sorted file, exact file markers/TAP parsing, and loopback socket-quiescence regression | `reference/validation/STEP014DR7_OR_ISSUE_181.md` |
| OR-ISSUE-182 | STEP014DR7 aggregate | deterministic nested UI live failed before startup with `ERR_MODULE_NOT_FOUND` | copied current fixture import pointed to a presumed DR7 seed module that was never created | import the retained DR6 deterministic schema-14 seed owner and gate all current relative imports | `reference/validation/STEP014DR7_OR_ISSUE_182.md` |
| OR-ISSUE-183 | STEP014DR7 audit | current live Protocol clients reported `0.14.9-step014dr7` | copied DR6 client identity was only partially renamed | align both live client versions to the current root package and reject the stale mixed literal | `reference/validation/STEP014DR7_OR_ISSUE_183.md` |

## STEP014DR8
| Issue | Step | Symptom | Root cause | Prevention | Evidence |
|---|---|---|---|---|---|
| OR-ISSUE-184 | STEP014DR8 | Windows DR7 passed 319/320 but deterministic Control UI timed out at `delegation-nav:false` | aggregate build omitted exact Vue acquisition and `OPENRILL_VUE_RUNTIME_VENDOR_DIR`, reproducing the historical OR-ISSUE-074 missing runtime boundary | ordered acquisition/re-extraction/byte verification, vendor-aware build, shared vendor env | `reference/validation/STEP014DR8_OR_ISSUE_184.md` |
| OR-ISSUE-185 | STEP014DR8 | browser bootstrap failure was reduced to one false selector result | deterministic UI fixture omitted served Vue preflight, `Page.navigate.errorText` and bounded CDP page evidence | exact static preflight plus navigation/network/console/runtime/page-state evidence | `reference/validation/STEP014DR8_OR_ISSUE_185.md` |
| OR-ISSUE-186 | STEP014DR8 canonical | retained DR7 boundary test rejected valid DR8 root version | historical test owned mutable `package.json.version` instead of immutable DR7 evidence | retain DR7 scripts/plan assertions, reject historical current ownership, current version gate remains single owner | `reference/validation/STEP014DR8_OR_ISSUE_186.md` |
| OR-ISSUE-187 | STEP014DR8 lifecycle audit | navigation or CDP setup failure could leave Chromium outside outer cleanup ownership | browser handle transferred only after successful `launch()` return | guarded partial-launch cleanup, Windows tree-kill fallback, preserved aggregate failure evidence | `reference/validation/STEP014DR8_OR_ISSUE_187.md` |
| OR-ISSUE-188 | STEP014DR8 lifecycle audit | current DR8 fixtures could regress while lifecycle audit still passed | manually maintained audit inventory remained pinned to DR6 paths | include current DR8 HTTP/Host/Chromium fixtures and current partial-launch checks | `reference/validation/STEP014DR8_OR_ISSUE_188.md` |
| OR-ISSUE-189 | STEP014DR8 deterministic UI lifecycle | final Chromium/Host/temp cleanup failure could be swallowed and a cleanup-only failure could pass | retained DR7-style `.catch(() => undefined)` suppression in the outer `finally` owner | collect every cleanup failure and preserve body+cleanup causes through typed `AggregateError` | `reference/validation/STEP014DR8_OR_ISSUE_189.md` |

## STEP014 Product closure / STEP015A governance reset
| Issue | Step | Symptom | Root cause | Prevention | Evidence |
|---|---|---|---|---|---|
| OR-ISSUE-190 | STEP014DR8 Windows | deterministic tree rendered, then privacy assertion found `Raw child transcript` | Control UI projection still included a prohibited raw marker | classify as optional UI/Product privacy backlog; do not claim privacy-safe UI until fixed | `reference/validation/STEP014_OR_ISSUE_190.md` |
| OR-ISSUE-191 | STEP014DR8 Windows | Chromium PID 11420 remained after body failure | browser fixture cleanup did not reach process quiescence | classify as Harness backlog; browser is non-blocking for non-UI Product closure | `reference/validation/STEP014_OR_ISSUE_191.md` |
| OR-ISSUE-192 | STEP014 DR series | Product work stalled behind repeated acceptance transport/browser corrections | one aggregate coupled Product, Integration, optional UI, Harness, and Package status | independent status dimensions, profile-based validation, and one-correction stop-loss rule | `reference/validation/STEP014_OR_ISSUE_192.md` |
| OR-ISSUE-193 | STEP014 DR series | total human hours could not be answered from evidence | no explicit work-time ledger existed | required start/end/human/automation duration fields with `NOT_RECORDED` when unknown | `reference/validation/STEP014_OR_ISSUE_193.md` |
| OR-ISSUE-194 | STEP015A canonical | historical accepted-baseline scope test failed `2 !== 1` | historical STEP012BR1 test froze mutable `config/current-accepted-baseline.json.schemaVersion` at 1 | historical tests validate positive schema/required fields; current STEP owns exact dimensional schema 2 | `reference/validation/STEP015A_OR_ISSUE_194.md` |
| OR-ISSUE-195 | STEP015A canonical | historical STEP014DR2 boundary rejected `0.15.0-step015a` because it required `/^0\.14\./` | previous freeze prevention removed exact versions but still allowed a historical test to own the mutable current minor line | historical tests retain immutable step evidence and validate only generic current-version syntax | `reference/validation/STEP015A_OR_ISSUE_195.md` |
| OR-ISSUE-196 | STEP015A post-validation documentation | governance test rejected measured `automated_run_seconds=63.695` because it required the pre-run placeholder | test conflated unknown human effort with measurable post-run automation duration | human time remains `NOT_RECORDED`; completed automated duration must be numeric and exact evidence owns the value | `reference/validation/STEP015A_OR_ISSUE_196.md` |

## STEP015B
| Issue | Step | Symptom | Root cause | Prevention | Evidence |
|---|---|---|---|---|---|
| OR-ISSUE-197 | STEP015B focused Product route | actual Host backend failed at workspace root with `workspace path must be a non-empty string` | canonical workspace root is represented by empty relative path, but the new backend invocation forwarded it without `.` normalization | normalize backend cwd to `.`, retain canonical ledger value, and require one actual Product-router test per provider | `reference/validation/STEP015B_OR_ISSUE_197.md` |

### OR-ISSUE-198 — Zero-dist build depended on stale sandbox output

| Field | Value |
|---|---|
| First observed | STEP015B source/package acceptance |
| Classification | Package build graph |
| Symptom | `@openrill/sandbox` was unresolved after acceptance cleanup; downstream tests lacked State migration output |
| Direct cause | `tools-process` preceded the new `sandbox` projects in the top-level TypeScript build order, while an earlier incremental build reused stale `dist` |
| Correction | materialize `sandbox`, then `sandbox-docker`, then `tools-process`, before Host consumers |
| Product acceptance impact | blocks source/package acceptance; does not invalidate already-proven runtime behavior |
| Evidence | `reference/validation/STEP015B_OR_ISSUE_198.md` |

### OR-ISSUE-199 — Historical timeout test froze the complete execution config object

| Field | Value |
|---|---|
| First observed | STEP015B canonical package-candidate validation |
| Classification | Harness / historical mutable current-object freeze |
| Symptom | STEP011R5 rejected legitimate STEP015B execution backend defaults |
| Direct cause | historical timeout test deep-equaled the complete extensible `execution` object |
| Correction | assert only approval mode and independent timeout fields owned by STEP011R5 |
| Product acceptance impact | blocks canonical source/package acceptance; no runtime Product defect |
| Evidence | `reference/validation/STEP015B_OR_ISSUE_199.md` |

### OR-ISSUE-200 — STEP014C boundary still froze the mutable current State schema

| Field | Value |
|---|---|
| First observed | STEP015B canonical package-candidate validation |
| Classification | Harness / historical current-schema freeze |
| Symptom | STEP014C required current schema exactly 14 and rejected append-only schema 15 |
| Direct cause | immutable migration ownership and mutable current-schema ownership remained coupled in one assertion |
| Correction | retain migration 014 evidence and require current schema at least 14 |
| Recurrence | OR-ISSUE-137 and OR-ISSUE-194 class |
| Evidence | `reference/validation/STEP015B_OR_ISSUE_200.md` |

### OR-ISSUE-201 — Exact-schema recurrence was not swept across the historical suite

| Field | Value |
|---|---|
| First observed | next canonical file immediately after OR-ISSUE-200 |
| Classification | Harness / incomplete recurrence-prevention sweep |
| Symptom | seven additional STEP014 tests still required latest State schema exactly 14 |
| Direct cause | first correction was file-local instead of repository-wide for the known recurrence class |
| Correction | audit all historical tests; retain migration 014 and minimum lineage, remove latest-schema ownership |
| Operating-method impact | recurrence classes must be swept before canonical resumes |
| Evidence | `reference/validation/STEP015B_OR_ISSUE_201.md` |

### OR-ISSUE-202 — Current root documents omitted accepted-baseline checks and SHA

| Field | Value |
|---|---|
| First observed | STEP015B canonical package-candidate validation |
| Classification | Documentation / ZIP-only handoff evidence omission |
| Symptom | root documents named the baseline but omitted its exact checks and SHA |
| Direct cause | candidate-status rewrite shortened immutable accepted-baseline identity |
| Correction | restore step, checks, and SHA in every current root handoff document |
| Evidence | `reference/validation/STEP015B_OR_ISSUE_202.md` |


### OR-ISSUE-203 — Docker stale-prune live fixture compared full and abbreviated container IDs

| Field | Value |
|---|---|
| First observed | STEP015B Windows Docker live attempt 1, aggregate 63/64 |
| Classification | Harness / Docker identity evidence normalization |
| Symptom | successful stale removal could be reported as `exact-profile stale container was not pruned` |
| Direct cause | exact equality compared the full `docker create` ID with possibly abbreviated `docker ps -q` IDs |
| Correction | prefix-safe ID identity plus independent `ps --no-trunc --filter id=...` absence proof |
| Product acceptance impact | does not establish a Product prune defect; Docker live promotion remains pending rerun |
| Evidence | `reference/validation/STEP015B_OR_ISSUE_203.md` |

## STEP016A

| Issue | Step | Symptom | Root cause | Prevention | Evidence |
|---|---|---|---|---|---|
| OR-ISSUE-204 | STEP016A canonical | promoted STEP015B baseline was rejected by a retained STEP015A test | historical governance owned mutable current baseline identity and required `STEP014_PRODUCT_CORE_ACCEPTED` | historical tests own immutable closure evidence only; current STEP owns exact baseline/checks/SHA | `reference/validation/STEP016A_OR_ISSUE_204.md` |
| OR-ISSUE-205 | STEP016A final handoff audit | candidate HANDOFF temporarily omitted retained OR-ISSUE-190/191 visibility | current-scope rewrite did not carry forward unresolved accepted-lineage assets | every current HANDOFF retains unresolved lineage issues and adjacent accepted-baseline evidence | `reference/validation/STEP016A_OR_ISSUE_205.md` |

## STEP016AR1
| Issue | Step | Symptom | Root cause | Prevention | Evidence |
|---|---|---|---|---|---|
| OR-ISSUE-206 | STEP016AR1 | Windows DPAPI live failed at setup after all source/package stages passed | the provider appended operation/path after string `-Command` and incorrectly expected them in PowerShell `$args` | final `-EncodedCommand`, non-secret metadata environment, secret-only stdin/secure prompt, bounded diagnostic evidence | `reference/validation/STEP016AR1_OR_ISSUE_206.md` |

## STEP016AR1 H1

| Issue | Step | Symptom | Root cause | Prevention | Evidence |
|---|---|---|---|---|---|
| OR-ISSUE-207 | STEP016AR1 Windows live attempt 1 | the DPAPI child stage passed 12/12 but the aggregate reported 68/69 FAILED | current aggregate invoked retained STEP016A live fixture, whose valid historical marker could not satisfy the current STEP016AR1 marker predicate | invoke the current AR1 fixture; reject old live path in current runner; require aggregate/fixture STEP-version-schema identity | `reference/validation/STEP016AR1_OR_ISSUE_207.md` |

## STEP016B
| Issue | Step | Symptom | Root cause | Prevention | Evidence |
|---|---|---|---|---|---|
| OR-ISSUE-208 | STEP016B governance preflight | retained STEP015B/016A tests rejected valid STEP016AR1 accepted-baseline promotion | the previous mutable-baseline ownership sweep did not include later governance tests | historical tests prove immutable evidence only; current STEP exclusively owns exact current baseline; repository-wide executable assertion scan | `reference/validation/STEP016B_OR_ISSUE_208.md` |
| OR-ISSUE-209 | STEP016B handoff preflight | candidate HANDOFF omitted closed OR-ISSUE-206/207 continuity and weakened Connector deferral rationale | current-state rewrite did not preserve the required continuity set | current handoff gate requires accepted identity, unresolved 190/191, recent closed 206/207, and real-system Connector prerequisite | `reference/validation/STEP016B_OR_ISSUE_209.md` |


### OR-ISSUE-208 recurrence note — STEP016C
The retained STEP016B governance test still owned the exact STEP016AR1 current baseline. STEP016C intercepted the recurrence before canonical execution and moved STEP016B proof to immutable Windows acceptance evidence. No new Product issue was created.


### OR-ISSUE-210 — Package manifest verifier current identity drift
| Field | Value |
|---|---|
| First observed | STEP016C package-candidate acceptance |
| Classification | Package Harness / current identity alignment |
| Symptom | manifest contents, file count and hashes matched, but verifier returned FAIL only on STEP/version identity |
| Direct cause | `generate_package_manifest.py`, root package and source versions advanced to STEP016C while `verify_package_manifest.py` retained STEP016B constants |
| Correction | align current verifier to STEP016C and gate generator/verifier/root package identity together |
| Product impact | none; Product focused and affected regression were already PASS |
| Evidence | `reference/validation/STEP016C_OR_ISSUE_210.md` |

### OR-ISSUE-211 — STEP016B accepted-baseline identity was only partially promoted
| Field | Value |
|---|---|
| First observed | STEP016C canonical package-candidate validation |
| Classification | Governance / accepted-baseline atomic identity alignment |
| Symptom | current baseline named STEP016B but retained STEP016AR1 artifact, evidence, and dimension values |
| Direct cause | promotion updated selected fields instead of the complete identity object |
| Correction | align and cross-gate step/version/checks/artifact/zip/SHA/evidence/dimensions atomically |
| Product impact | none; STEP016B Windows live acceptance remains valid |
| Evidence | `reference/validation/STEP016C_OR_ISSUE_211.md` |

### OR-ISSUE-212 — VALIDATION root handoff omitted the exact current candidate identity
| Field | Value |
|---|---|
| First observed | STEP016C canonical package-candidate validation |
| Classification | Documentation / ZIP-only handoff current-candidate identity |
| Symptom | `VALIDATION.md` lacked the exact STEP016C candidate name |
| Direct cause | command-focused rewrite retained shorthand but dropped immutable current identity |
| Correction | restore STEP/version/schema and retain root-document manifest/baseline cross-gate |
| Product impact | none |
| Evidence | `reference/validation/STEP016C_OR_ISSUE_212.md` |

### OR-ISSUE-213 — STEP016C live fixture missed a pre-observed Host close event

| Field | Value |
|---|---|
| First observed | First real Windows STEP016C live run, `82/83 FAILED` |
| Classification | Harness / child-process lifecycle evidence race |
| Symptom | all source/package stages passed; live stage consumed its full 300-second timeout |
| Direct cause | fixture registered `host.child.once("close")` after `openrill stop` had already allowed Windows to deliver the close event |
| Correction | listener-first, pre-observed-state-aware, bounded `waitForChildClose()` plus live phase markers |
| Product impact | none; Product version `0.16.3-step016c` and schema 15 unchanged |
| Evidence | `reference/validation/STEP016C_OR_ISSUE_213.md` |

### OR-ISSUE-214 — Explicit Conversation history was treated as prompt leakage

| Field | Value |
|---|---|
| First observed | Second real Windows STEP016C live run, `90/91 FAILED` |
| Classification | Harness / output-privacy semantics |
| Symptom | all Product phases including Host stop passed; final `redaction` assertion failed |
| Direct cause | fixture required prompts to be absent from `conversation show`, contradicting the authenticated durable-history Product contract |
| Correction | independently prove secret absence everywhere, prompt non-echo in transient outputs, and prompt presence in explicitly requested history |
| Product impact | none; Product version `0.16.3-step016c` and schema 15 unchanged |
| Evidence | `reference/validation/STEP016C_OR_ISSUE_214.md` |


### OR-ISSUE-219 — Memory tool fixture referenced nonexistent provenance

| Field | Value |
|---|---|
| First observed | STEP018A first focused memory-tool run |
| Classification | Harness / fixture validity |
| Symptom | `memory.remember` failed with a State foreign-key violation |
| Direct cause | fixture supplied synthetic Conversation/Run IDs that did not exist |
| Correction | create the durable Conversation and Run through Product services before tool execution |
| Product impact | none; fail-closed provenance integrity was correct |
| Evidence | `reference/validation/STEP018A_OR_ISSUE_219.md` |

## STEP018B

### OR-ISSUE-220 — Skill fixture used unsupported inline YAML

| Field | Value |
|---|---|
| First observed | STEP018B focused Skill operations validation |
| Classification | Harness / strict Skill manifest fixture mismatch |
| Symptom | Skill list/show/check tests failed with `SKILL_MANIFEST_INVALID` while Tool Discovery tests passed |
| Direct cause | fixture wrote `resources: []`, but the existing strict Skill parser owns block-list syntax |
| Correction | use a parser-conformant block-list fixture; retain invalid syntax only in explicit fail-closed tests |
| Product impact | none; Product parser correctly rejected unsupported syntax |
| Additional prevention | actual profile-sensitive Browser Tool eligibility regression |
| Evidence | `reference/validation/STEP018B_OR_ISSUE_220.md` |

### OR-ISSUE-221 — Host lifecycle retained STEP018A runtime version literals

| Field | Value |
|---|---|
| First observed | STEP018B source/version alignment after focused Product PASS |
| Classification | Source/package current identity drift |
| Symptom | two Host lifecycle literals remained `0.18.0-step018a` |
| Direct cause | package/source bulk version update did not include runtime-info construction literals |
| Correction | align both Host runtime-info values to `0.18.1-step018b` |
| Product impact | none; capability tests already passed |
| Evidence | `reference/validation/STEP018B_OR_ISSUE_221.md` |

### OR-ISSUE-222 — Historical Skill preparation test retained the old coordinator option

| Field | Value |
|---|---|
| First observed | STEP018B affected Agent/Skill regression |
| Classification | Historical Harness / internal callback API alignment |
| Symptom | intended preparation failure fixture left Run `CREATED` |
| Direct cause | JavaScript fixture supplied removed `resolveSystemInstructions` instead of `resolveRunPreparation` |
| Correction | use the current preparation callback and retain durable `SKILL_PREPARATION_FAILED` evidence |
| Product impact | none; intentional preparation boundary now also returns model Tool visibility |
| Evidence | `reference/validation/STEP018B_OR_ISSUE_222.md` |

### OR-ISSUE-209 recurrence note — STEP018B

STEP018B canonical validation rejected a range-compressed `OR-ISSUE-206–214` style reference because exact individual issue tokens were no longer searchable in `VALIDATION.md`. The current documents now retain every required issue identifier explicitly. No new Product issue was created.

### OR-ISSUE-223 — Tool catalog compaction hid accepted Memory mutation tools

| Field | Value |
|---|---|
| First observed | STEP018B canonical, STEP018A Host memory integration |
| Classification | Product integration regression / accepted capability visibility |
| Symptom | first model request no longer exposed `memory.remember` |
| Direct cause | compact direct Tool set included search/get but omitted remember/forget |
| Correction | retain all four explicit Memory tools in the core direct schema set |
| Product impact | accepted STEP018A memory flow would be weakened without correction |
| Evidence | `reference/validation/STEP018B_OR_ISSUE_223.md` |

## STEP018C

### OR-ISSUE-224 — Temporal benchmark evidence retained mutable ModelRequest references

| Field | Value |
|---|---|
| First observed | STEP018C first ten-scenario benchmark run |
| Classification | Benchmark Harness / temporal evidence snapshot |
| Symptom | request-time traces appeared to contain Tool results that were produced only in later turns |
| Direct cause | benchmark recorder retained mutable `ModelRequest.messages` references extended by Agent Kernel execution |
| Correction | snapshot request values inside `onRequest`; identify Tool evidence by exact Tool call identity |
| Product impact | none; Agent Kernel behavior was correct |
| Evidence | `reference/validation/STEP018C_OR_ISSUE_224.md` |

### OR-ISSUE-225 — Approval benchmark fixture omitted authoritative Workspace provenance

| Field | Value |
|---|---|
| First observed | STEP018C first ten-scenario benchmark run |
| Classification | Benchmark fixture / Product provenance |
| Symptom | approval scenario failed with a SQLite foreign-key violation before approval evaluation |
| Direct cause | fixture permitted a Workspace ID in ConversationService without inserting the authoritative Workspace SOT row |
| Correction | create a physical temporary Workspace, resolve its catalog descriptor and upsert it before the Run |
| Product impact | none; State correctly failed closed |
| Evidence | `reference/validation/STEP018C_OR_ISSUE_225.md` |

### OR-ISSUE-208 recurrence note — STEP018C

The retained STEP018B governance test still asserted that STEP018B was the mutable current package and STEP018A the mutable current accepted baseline. STEP018C moves those assertions to immutable STEP018B Windows evidence and leaves exact current identity ownership to STEP018C governance. No duplicate issue number was created.


## STEP019A

### OR-ISSUE-226 — Reused workspace links loaded a prior candidate

| Field | Value |
|---|---|
| First observed | STEP019A first Host goal focused run |
| Classification | Harness/package workspace-link materialization |
| Symptom | goal preparation loaded a State repository without `goals.getOpen` |
| Direct cause | copied absolute `node_modules/@openrill/*` links still targeted the prior STEP018C extraction |
| Correction | rematerialize links to the current source root and verify every declared edge by realpath |
| Product impact | none; current Product source and build were correct |
| Evidence | `reference/validation/STEP019A_OR_ISSUE_226.md` |

### OR-ISSUE-227 — History-aware fixture selected the wrong Tool result

| Field | Value |
|---|---|
| First observed | STEP019A Host restart goal continuation test |
| Classification | Harness temporal evidence selection |
| Symptom | fixture read a historical `goal.create` result while asserting the current `goal.get` result |
| Direct cause | selection used generic `role=tool` instead of exact Tool identity |
| Correction | select by exact Tool name and Tool-call identity, never positional history |
| Product impact | none; durable Conversation history was correct |
| Evidence | `reference/validation/STEP019A_OR_ISSUE_227.md` |

### OR-ISSUE-208 recurrence note — STEP019A

Retained STEP018C governance may not freeze STEP018C as the mutable current package or STEP018B as the mutable current accepted baseline after STEP018C promotion. STEP019A owns current identity; STEP018C owns only its immutable Windows evidence.


### OR-ISSUE-228 — Historical Memory test froze the mutable current State schema

| Field | Value |
|---|---|
| First observed | STEP019A canonical, STEP018A Memory capability test |
| Classification | Historical Harness / mutable schema ownership |
| Symptom | Memory behavior passed but exact assertion failed with `17 !== 16` |
| Direct cause | historical test owned the global current schema instead of its introduction floor |
| Correction | require schema `>=16` and opened schema equal to current runtime schema |
| Product impact | none; additive schema 17 and Memory behavior were correct |
| Evidence | `reference/validation/STEP019A_OR_ISSUE_228.md` |

### OR-ISSUE-229 — Windows live schema check inspected a re-export barrel

| Field | Value |
|---|---|
| First observed | First real Windows STEP019A live run, aggregate `33/34 FAILED`, child `9/10 FAILED` |
| Classification | Harness / State schema source-of-truth evidence |
| Symptom | all Product tests and canonical passed; only `check=schema detail=` failed |
| Direct cause | live fixture searched `packages/state/src/index.ts` for a definition that is only re-exported there |
| Correction | compare schema 17 with the built State runtime export and include the observed value in failure detail |
| Product impact | none; Product version `0.19.0-step019a` and State schema 17 unchanged |
| Evidence | `reference/validation/STEP019A_OR_ISSUE_229.md` |

## STEP019B

### OR-ISSUE-230 — Graceful Host shutdown was indistinguishable from operator cancellation

| Field | Value |
|---|---|
| First observed | STEP019B detached execution code audit |
| Classification | Product lifecycle / Run recovery semantics |
| Symptom | normal Host close terminally cancelled an otherwise checkpoint-resumable Run |
| Direct cause | Coordinator close used the same untyped abort as operator cancellation |
| Correction | typed Host-shutdown abort, resumable interruption classification, operator cancel retained |
| Evidence | `reference/validation/STEP019B_OR_ISSUE_230.md` |

### OR-ISSUE-231 — Recovered root Runs were classified but never scheduled

| Field | Value |
|---|---|
| First observed | STEP019B Host startup code audit |
| Classification | Product lifecycle / durable scheduling |
| Symptom | checkpointed root Run remained `CREATED/RESUMABLE` indefinitely after restart |
| Direct cause | startup discarded recovery results and scheduled only delegated child work |
| Correction | deterministic CREATED-Run scan and root-only startup scheduling |
| Evidence | `reference/validation/STEP019B_OR_ISSUE_231.md` |

### OR-ISSUE-232 — Resume preparation could use stale aborted Attempt provenance

| Field | Value |
|---|---|
| First observed | STEP019B Coordinator preparation-order audit |
| Classification | Product provenance / recovery ordering |
| Symptom | Goal continuation preparation could be attributed to the aborted prior Attempt |
| Direct cause | preparation preceded Attempt rollover owned by Agent Kernel start |
| Correction | prepare fresh Attempt before preparation; approval resume uses read-only Goal context |
| Evidence | `reference/validation/STEP019B_OR_ISSUE_232.md` |

### OR-ISSUE-208 recurrence note — STEP019B

Retained STEP019A governance owns immutable STEP019A Product and Windows evidence. It must not freeze STEP019A as the mutable package identity or STEP018C as the current accepted baseline after STEP019A promotion.

## STEP020A

### OR-ISSUE-233 — Offline package-manager bootstrap could not fetch pnpm

| Field | Value |
|---|---|
| First observed | STEP020A lock refresh |
| Classification | Environment / package-manager bootstrap |
| Symptom | `corepack pnpm install --lockfile-only` failed with `EAI_AGAIN registry.npmjs.org` |
| Direct cause | validation environment could not fetch pnpm `11.15.1` from npm |
| Correction | align lock from actual manifests, verify with workspace lock gate, reserve frozen install for Windows |
| Product impact | none; source dependency graph and lock alignment passed |
| Evidence | `reference/validation/STEP020A_OR_ISSUE_233.md` |

### OR-ISSUE-234 — Current-root package exports had no built dist bootstrap

| Field | Value |
|---|---|
| First observed | STEP020A TypeScript resolution after workspace-link rematerialization |
| Classification | Build bootstrap / package export materialization |
| Symptom | many `Cannot find module '@openrill/...'` errors |
| Direct cause | package exports target current-root `dist`, which did not yet exist |
| Correction | use accepted outputs only to bootstrap resolution, then clean/full-build current source; exclude outputs from ZIP |
| Product impact | none; full STEP020A workspace build passed |
| Evidence | `reference/validation/STEP020A_OR_ISSUE_234.md` |

### OR-ISSUE-235 — Mandatory TaskService option broke retained Automation callers

| Field | Value |
|---|---|
| First observed | STEP020A affected Automation regression |
| Classification | Product internal API compatibility / test regression |
| Symptom | coordinator execution count remained zero and dependent test was cancelled |
| Direct cause | new `tasks` option was mandatory in `AutomationConversationExecutor` |
| Correction | make injection optional at compatibility boundary; production always injects it; prove reclassification without duplication |
| Product impact | corrected before acceptance; retained Automation behavior preserved |
| Evidence | `reference/validation/STEP020A_OR_ISSUE_235.md` |

### OR-ISSUE-208 recurrence note — STEP020A

Retained STEP019B governance owns immutable STEP019B source contracts and operator-supplied Windows acceptance evidence. It must not freeze STEP019B as the mutable package identity or STEP019A as the mutable accepted baseline after STEP019B promotion. STEP020A alone owns current candidate identity and the accepted STEP019B checks/SHA tuple.

### OR-ISSUE-236 — Local Protocol capability contract omitted Task operations

| Field | Value |
|---|---|
| First observed | STEP020A first full canonical run |
| Classification | Product protocol contract / retained integration acceptance |
| Symptom | exact handshake operation list rejected `task.cancel`, `task.get`, `task.list` |
| Direct cause | production registry was updated but retained broad capability contract was not |
| Correction | update exact sorted operation list and retain focused Task protocol tests |
| Product impact | Task operations were present; public protocol acceptance was incomplete until corrected |
| Evidence | `reference/validation/STEP020A_OR_ISSUE_236.md` |

### OR-ISSUE-237 — Task Flow workspace FK exceeded accepted ownership

| Field | Value |
|---|---|
| First observed | STEP020B focused Task Flow lifecycle test |
| Classification | Persistence boundary incompatibility |
| Symptom | valid configured-workspace Flow insertion failed without a `workspace_registrations` row |
| Direct cause | migration 019 added a physical FK stronger than the accepted Conversation/Task ownership contract |
| Correction | remove the unrelated FK; retain configured-workspace authorization and same-workspace Task-link checks in `TaskFlowService` |
| Product impact | corrected before candidate acceptance; no accepted baseline data changed |
| Evidence | `reference/validation/STEP020B_OR_ISSUE_237.md` |

### OR-ISSUE-238 — Current continuation omitted retained OR-ISSUE-213

| Field | Value |
|---|---|
| First observed | STEP020B first full canonical run |
| Classification | Documentation continuity / retained failure visibility |
| Symptom | `live-child-close-step016ch1.test.mjs` failed because current `HANDOFF.md` and `VALIDATION.md` lacked `OR-ISSUE-213` |
| Direct cause | current-state rewrite copied a selected issue subset instead of the canonical retained-token contract |
| Correction | restore `OR-ISSUE-213`, record `OR-ISSUE-238`, and govern both mutable continuation assets |
| Product impact | none; detected before source/package acceptance |
| Evidence | `reference/validation/STEP020B_OR_ISSUE_238.md` |

### OR-ISSUE-239 — Current continuation omitted retained OR-ISSUE-214

| Field | Value |
|---|---|
| First observed | STEP020B second full canonical run |
| Classification | Documentation continuity / privacy failure visibility |
| Symptom | `live-output-privacy-step016ch2.test.mjs` failed because current `HANDOFF.md` and `VALIDATION.md` lacked `OR-ISSUE-214` or its H2 identity |
| Direct cause | first correction restored only the prior failing token; no complete code-derived handoff-reader preflight existed |
| Correction | restore `OR-ISSUE-214`, record `OR-ISSUE-239`, govern exact tokens, and preflight every canonical handoff/validation reader |
| Product impact | none; privacy Product tests remained green |
| Evidence | `reference/validation/STEP020B_OR_ISSUE_239.md` |


## OR-ISSUE-240 — Task Flow owner scope missing
Same-Workspace cross-Conversation Task links were possible. STEP020BR1 adds Conversation owner scope and legacy isolation.

## OR-ISSUE-241 — Cancellation did not close Task admission
New child links were possible after durable cancellation intent. STEP020BR1 rejects new links while preserving exact replay.

## STEP020C

### OR-ISSUE-242 — Child Run and Flow link were not one atomic admission

| Field | Value |
|---|---|
| First observed | STEP020C OpenClaw runtime comparison |
| Classification | Durable cross-ledger transaction boundary |
| Symptom | separate Conversation send and Flow link could orphan a Run/Task after link or revision failure |
| Direct cause | no controller-owned composition point existed across Conversation, Task and Task Flow repositories |
| Correction | add `sendInTransaction` and commit child Run/Task/classification/link/revision/event in one State transaction |
| Evidence | `reference/validation/STEP020C_OR_ISSUE_242.md` |

### OR-ISSUE-243 — Public `state` payload shadowed runtime database state

| Field | Value |
|---|---|
| First observed | STEP020C public protocol test |
| Classification | Dependency binding / public-input namespace collision |
| Symptom | `taskFlow.create` returned `INTERNAL_ERROR`; runtime had no `.transaction()` method |
| Direct cause | factory spread the whole public input over dependency options |
| Correction | copy only workspace, owner and controller identity into the bound runtime |
| Evidence | `reference/validation/STEP020C_OR_ISSUE_243.md` |

### OR-ISSUE-244 — Terminal child replay attempted scheduling

| Field | Value |
|---|---|
| First observed | STEP020C exact replay review before Host integration |
| Classification | Idempotency / execution lifecycle |
| Symptom | every replay called the scheduler even when the durable Run was terminal |
| Direct cause | scheduling was unconditional after durable lookup |
| Correction | schedule only `CREATED` or `RUNNING`; terminal replay returns stable identity with `scheduled=false` |
| Evidence | `reference/validation/STEP020C_OR_ISSUE_244.md` |

### OR-ISSUE-245 — Clean build order omitted the new Task Flow dependency

| Field | Value |
|---|---|
| First observed | STEP020C first full clean acceptance |
| Classification | Build graph / dependency ordering |
| Symptom | `Cannot find module '@openrill/conversations'` after all `dist` outputs were deleted |
| Direct cause | root build listed Task Flow before Conversations after a new direct dependency was added |
| Correction | order Conversations before Task Flow and retain lock/build-order governance |
| Evidence | `reference/validation/STEP020C_OR_ISSUE_245.md` |

### OR-ISSUE-246 — Fresh dependency materialization escaped the Fresh source root

| Field | Value |
|---|---|
| First observed | STEP020C immutable ZIP Fresh verification |
| Classification | Package verification procedure / dependency materialization |
| Symptom | every copied `@openrill/*` workspace link failed `outside_root` |
| Direct cause | the whole root `node_modules` directory was linked back to the original work tree, so its relative workspace links resolved there |
| Correction | copy the resolved link-farm layout with preserved link text; reject a symlinked source directory and any target link escaping the Fresh root |
| Product impact | none; corrected procedure subsequently passed module links, clean build and focused Product 18/18 in the Fresh extraction |
| Evidence | `reference/validation/STEP020C_OR_ISSUE_246.md` |

## STEP020D

### OR-ISSUE-247 — LOST design assumed a Task could outlive a deleted Run row

| Field | Value |
|---|---|
| First observed | STEP020D persistence and LOST code audit |
| Classification | Design / execution Source-of-Truth boundary |
| Symptom | proposed `missing Run -> Task LOST` state cannot exist under accepted schema |
| Direct cause | design preceded inspection of `background_tasks.run_id ... ON DELETE CASCADE` |
| Correction | define LOST as unreclaimed runtime authority after Host recovery grace; fail owning Run and project Task LOST |
| Evidence | `reference/validation/STEP020D_OR_ISSUE_247.md` |

### OR-ISSUE-248 — Retention admitted report-only active-authority conflicts

| Field | Value |
|---|---|
| First observed | STEP020D Task/Flow maintenance safety review |
| Classification | Product safety / retention boundary |
| Symptom | terminal Task with active Run and terminal Flow with active child could receive cleanup scheduling |
| Direct cause | retention trusted terminal projection without rechecking active execution authority |
| Correction | require terminal owning Run or all-terminal existing child Tasks before scheduling/preview |
| Evidence | `reference/validation/STEP020D_OR_ISSUE_248.md` |

### OR-ISSUE-249 — Maintenance test fixture used invalid Run transition

| Field | Value |
|---|---|
| First observed | STEP020D focused Task maintenance test |
| Classification | Validation fixture |
| Symptom | fixture attempted `CREATED -> COMPLETED` and was rejected by accepted lifecycle |
| Direct cause | fixture setup skipped required RUNNING transition |
| Correction | use `CREATED -> RUNNING -> COMPLETED`, then corrupt only Task projection |
| Evidence | `reference/validation/STEP020D_OR_ISSUE_249.md` |

### OR-ISSUE-250 — LOST reconcile used stale pre-repair Run snapshot

| Field | Value |
|---|---|
| First observed | STEP020D LOST focused test |
| Classification | Product maintenance ordering / read consistency |
| Symptom | same-pass retention event was absent after successful LOST closure |
| Direct cause | retention evaluated Run state captured before `markExecutionLost` |
| Correction | reload both Task and Run after LOST repair before later decisions |
| Evidence | `reference/validation/STEP020D_OR_ISSUE_250.md` |

### OR-ISSUE-251 — Partial package build lacked dependency dist materialization

| Field | Value |
|---|---|
| First observed | STEP020D initial changed-package build attempt |
| Classification | Validation procedure / build bootstrap |
| Symptom | unresolved workspace package exports before dependency outputs existed |
| Direct cause | dependent package was compiled in isolation rather than through root build references |
| Correction | clean root workspace build before focused tests; exclude all outputs from package |
| Evidence | `reference/validation/STEP020D_OR_ISSUE_251.md` |

### OR-ISSUE-208 recurrence note — STEP020D

Retained STEP020C governance owns immutable STEP020C source contracts and user-supplied Windows 43/43 evidence. It must not freeze STEP020C as the mutable package identity, schema 20 as the current schema, or STEP020BR1 as the current accepted baseline after STEP020C promotion. STEP020D alone owns current candidate identity and the accepted STEP020C tuple.

### OR-ISSUE-252 — Governance assumed SQL layout and wrong migration filename

| Field | Value |
|---|---|
| First observed | STEP020D first current-governance run |
| Classification | Validation governance path/format brittleness |
| Symptom | schema governance failed while migration and Product tests passed |
| Direct cause | single-line SQL regex and non-existent migration filename |
| Correction | whitespace-tolerant SQL assertion and actual code-derived migration path |
| Evidence | `reference/validation/STEP020D_OR_ISSUE_252.md` |

### OR-ISSUE-253 — Governance asserted invented Flow test-title prose

| Field | Value |
|---|---|
| First observed | STEP020D first current-governance run |
| Classification | Validation governance semantic-token drift |
| Symptom | focused-evidence governance failed despite passing Flow tests |
| Direct cause | assertion searched for `cancellation-stuck` instead of actual contract text |
| Correction | assert executable/action symbols and exact existing test contract text |
| Evidence | `reference/validation/STEP020D_OR_ISSUE_253.md` |

### OR-ISSUE-254 — Generic version verifier was assigned STEP identity ownership

| Field | Value |
|---|---|
| First observed | STEP020D first current-governance run |
| Classification | Validation governance ownership overreach |
| Symptom | current runner identity test failed on generic source-version verifier |
| Direct cause | one assertion required STEP+version from every current validation script |
| Correction | STEP-owned scripts assert STEP+version; generic verifier asserts version only |
| Evidence | `reference/validation/STEP020D_OR_ISSUE_254.md` |

### OR-ISSUE-255 — Governance used a non-existent retention title token

| Field | Value |
|---|---|
| First observed | STEP020D second current-governance run |
| Classification | Validation governance semantic-token drift |
| Symptom | focused-evidence governance alone failed while all Product tests passed |
| Direct cause | assertion searched for `retention-protected` instead of the executable title contract |
| Correction | assert `outside retention candidates` and implementation protected-active behavior |
| Evidence | `reference/validation/STEP020D_OR_ISSUE_255.md` |

### OR-ISSUE-256 — Local Protocol exact capability list omitted maintenance operations

| Field | Value |
|---|---|
| First observed | STEP020D first affected regression |
| Classification | Product public protocol acceptance |
| Symptom | authenticated handshake exact-operation assertion rejected six maintenance operations |
| Direct cause | operation registry changed without retained exact capability contract update |
| Correction | add all Task/Flow audit, reconcile, and retention-preview operations in sorted order |
| Evidence | `reference/validation/STEP020D_OR_ISSUE_256.md` |

### OR-ISSUE-257 — Canonical Local Protocol notice wait timed out after interrupted validation

| Field | Value |
|---|---|
| First observed | STEP020D canonical validation after an externally timed-out prior run |
| Classification | Validation environment / timing incident |
| Symptom | notice replay wait timed out and WebSocket durations expanded to 16–29 seconds |
| Root cause | not proven; no Product cause claimed |
| Correction | retain logs, require clean isolated full canonical pass, do not accept partial retry evidence |
| Verified result | 141 files, 749/749, skipped 0 without source change |
| Evidence | `reference/validation/STEP020D_OR_ISSUE_257.md` |

### OR-ISSUE-258 — Acceptance parent was terminated while canonical child survived

| Field | Value |
|---|---|
| First observed | STEP020D first integrated acceptance tool invocation |
| Classification | Execution-tool wrapper / validation process ownership |
| Symptom | Python parent ended after heartbeat while Node canonical process continued under PID 1 |
| Direct cause | external synchronous tool-call timeout, not an acceptance assertion |
| Correction | terminate orphan; run one detached aggregate process; accept only its final marker |
| Evidence | `reference/validation/STEP020D_OR_ISSUE_258.md` |

## STEP020E

### OR-ISSUE-259 — Active worktree disappeared

| Field | Value |
|---|---|
| First observed | STEP020E implementation after initial Host validation |
| Classification | Execution environment / ephemeral persistence |
| Correction | restore immutable STEP020D ZIP, reapply code-derived changes, rerun all evidence |
| Evidence | `reference/validation/STEP020E_OR_ISSUE_259.md` |

### OR-ISSUE-260 — Durable Tool scope widened after restart

| Field | Value |
|---|---|
| First observed | STEP020E Host restart focused test |
| Classification | Product security / durable execution provenance |
| Direct cause | root budget stored global registry names rather than effective Run tools |
| Correction | persist actual `modelToolDefinitions`; assert exact seven-tool scope after restart |
| Evidence | `reference/validation/STEP020E_OR_ISSUE_260.md` |

### OR-ISSUE-261 — Upgrade omitted already-terminal child delivery

| Field | Value |
|---|---|
| First observed | schema 21 to 22 migration fixture |
| Classification | Product migration / durable continuation |
| Direct cause | delivery intents existed only for post-upgrade terminal transitions |
| Correction | safely backfill active non-cancelling owner-matched terminal children as controller review |
| Evidence | `reference/validation/STEP020E_OR_ISSUE_261.md` |

### OR-ISSUE-262 — Validation flattened Task Flow link projection

| Field | Value |
|---|---|
| First observed | STEP020E progress-only Host focused test |
| Classification | Validation fixture / public view shape |
| Correction | read `tasks[].task` and rerun isolated plus full focused evidence |
| Product impact | none |
| Evidence | `reference/validation/STEP020E_OR_ISSUE_262.md` |

### OR-ISSUE-263 — Historical governance contradicted its own package evidence

| Field | Value |
|---|---|
| First observed | STEP020E combined current/historical governance |
| Classification | Validation governance / historical ownership overreach |
| Direct cause | retained STEP020D test prohibited the same `package.json` read required by its package-script assertion |
| Correction | remove self-referential prohibition; retain immutable runner and package mapping checks |
| Evidence | `reference/validation/STEP020E_OR_ISSUE_263.md` |

### OR-ISSUE-264 — Delivery governance invented a repository call

| Field | Value |
|---|---|
| First observed | STEP020E current governance |
| Classification | Validation governance / implementation-token invention |
| Direct cause | assertion expected `taskDeliveries.insert` instead of the in-transaction SQL insert |
| Correction | assert actual `INSERT INTO task_completion_deliveries` transaction evidence |
| Evidence | `reference/validation/STEP020E_OR_ISSUE_264.md` |

### OR-ISSUE-265 — Controller Tool governance used wrong source symbols

| Field | Value |
|---|---|
| First observed | STEP020E current governance |
| Classification | Validation governance / code-symbol drift |
| Direct cause | assertion searched for `runtimeForWakeRun` and callback variable `tool` |
| Correction | assert `bindingForWakeRun` and actual effective-Tool budget expression |
| Evidence | `reference/validation/STEP020E_OR_ISSUE_265.md` |

### OR-ISSUE-266 — Plan governance made capitalization contractual

| Field | Value |
|---|---|
| First observed | STEP020E current governance |
| Classification | Validation governance / prose case sensitivity |
| Direct cause | lowercase phrase assertion rejected capitalized sentence start |
| Correction | case-insensitive semantic phrase while preserving architectural decisions |
| Evidence | `reference/validation/STEP020E_OR_ISSUE_266.md` |

### OR-ISSUE-267 — Governance invented a pending-delivery Task event

| Field | Value |
|---|---|
| First observed | STEP020E current governance after SQL assertion correction |
| Classification | Validation governance / event-model invention |
| Direct cause | assertion required `task.delivery.pending`, which is not part of the Product event model |
| Correction | assert terminal event-sequence binding and durable `PENDING` delivery row |
| Evidence | `reference/validation/STEP020E_OR_ISSUE_267.md` |

### OR-ISSUE-268 — Retained Task governance froze identifier casing

| Field | Value |
|---|---|
| First observed | STEP020E full cumulative governance |
| Classification | Validation governance / retained source-symbol drift |
| Direct cause | STEP020A assertion expected lowercase `terminal` while current executable set is `TERMINAL` |
| Correction | assert the actual terminal monotonicity expression |
| Evidence | `reference/validation/STEP020E_OR_ISSUE_268.md` |

| OR-ISSUE-269 | STEP020E Windows LIVE / STEP020ER1 | second Host Local Protocol connection failed after READY | production `LocalCliProtocolClient.connect()` finalized a retryable pre-handshake transport error after one attempt | caller-deadline bounded retry for transport failure only; identity/auth/protocol errors remain fail-fast; exact Windows restart Harness | `reference/validation/STEP020ER1_OR_ISSUE_269.md` |

### OR-ISSUE-270 — Successful Windows LIVE Harness rejected by marker literal drift

| Field | Value |
|---|---|
| First observed | Actual STEP020ER1 Windows LIVE aggregate |
| Symptom | stage PASS and inner 21/21 PASSED, aggregate 59/60 FAILED |
| Classification | Acceptance evidence contract |
| Direct cause | independently copied whole marker strings diverged on `queue` and `migration` |
| Correction | JSON single source plus structural field-set validation |
| Evidence | `reference/validation/STEP020ER1_WINDOWS_LIVE_MARKER_CONTRACT_FAILURE.md`, `reference/validation/STEP020ER2_OR_ISSUE_270.md` |

### OR-ISSUE-271 — Historical STEP020ER1 governance reclaimed mutable current identity

| Field | Value |
|---|---|
| First observed | STEP020ER2 cumulative governance |
| Classification | Validation governance / historical ownership overreach |
| Direct cause | STEP020ER1 still fixed current package version, root continuation and mutable manifest scripts |
| Correction | immutable ER1 runner/evidence retained; mutable current identity transferred to ER2 |
| Evidence | `reference/validation/STEP020ER2_OR_ISSUE_271.md` |

### OR-ISSUE-272 — Windows Python validator import-path assumption

| Field | Value |
|---|---|
| First observed | Actual STEP020ER2 Windows LIVE aggregate |
| Symptom | 54/57 FAILED; focused 14/16; Live Harness 20/23 |
| Classification | Acceptance validator process entrypoint / cross-platform path |
| Direct cause | `python -c` package-style import assumed caller cwd was a Python import root |
| Correction | absolute `.py` entrypoint with `--validate-stdin`, `fileURLToPath`, external-cwd and shadow-package tests |
| Evidence | `reference/validation/STEP020ER2_WINDOWS_PYTHON_VALIDATOR_ENTRYPOINT_FAILURE.md`, `reference/validation/STEP020ER3_OR_ISSUE_272.md` |

### OR-ISSUE-273 — Windows failure state omitted from issue summary

| Field | Value |
|---|---|
| First observed | STEP020ER3 focused validation governance |
| Symptom | governance 13/14 while Product/validator tests passed |
| Classification | Validation evidence precision |
| Direct cause | issue summary omitted the `FAILED` state from `20/23 FAILED` |
| Correction | exact failure-state wording restored and gated |
| Evidence | `reference/validation/STEP020ER3_OR_ISSUE_273.md` |

## STEP021A Goal Plan executor issues

| Issue | Title | Classification | Correction | Evidence |
|---|---|---|---|---|
| OR-ISSUE-274 | Draft controller wrapper could admit the same Step twice | implementation draft / admission ownership | one explicit executor admission result; compile before Host wiring | `reference/validation/STEP021A_OR_ISSUE_274.md` |
| OR-ISSUE-275 | Generic Task Flow operations could bypass ordered Goal execution | Product authorization | route Goal-owned Flow mutations through the Goal executor | `reference/validation/STEP021A_OR_ISSUE_275.md` |
| OR-ISSUE-276 | Startup reconciliation admitted before controller review | durable continuation | RUNNING recovery leaves READY for durable controller decision | `reference/validation/STEP021A_OR_ISSUE_276.md` |
| OR-ISSUE-277 | Blocked Step left Goal ACTIVE | projection consistency | atomically project Goal BLOCKED; resume restores ACTIVE | `reference/validation/STEP021A_OR_ISSUE_277.md` |
| OR-ISSUE-278 | Generic Goal tools mutated an execution-owned Plan | mutation isolation | `GOAL_EXECUTION_ACTIVE` on generic mutations | `reference/validation/STEP021A_OR_ISSUE_278.md` |
| OR-ISSUE-279 | Flow cancellation committed before Goal projection | crash recovery | idempotent cancellation projection during recovery | `reference/validation/STEP021A_OR_ISSUE_279.md` |
| OR-ISSUE-280 | Protocol fixture omitted cancellation runtime | validation fixture | production-parity cancel callback | `reference/validation/STEP021A_OR_ISSUE_280.md` |
| OR-ISSUE-281 | Host fixture source Run remained CREATED | validation provenance | complete source Run before Goal creation | `reference/validation/STEP021A_OR_ISSUE_281.md` |
| OR-ISSUE-282 | Fixture violated closed `task_flow.run` schema | validation fixture | use exact public Tool contract | `reference/validation/STEP021A_OR_ISSUE_282.md` |
| OR-ISSUE-283 | Fixture reused historical Tool result across wakes | validation Run scope | per-wake state machine | `reference/validation/STEP021A_OR_ISSUE_283.md` |
| OR-ISSUE-284 | Fixture reused Tool call ID across Runs | durable replay fixture | Run-scoped Tool call IDs | `reference/validation/STEP021A_OR_ISSUE_284.md` |

| OR-ISSUE-285 | Governance invented `one_active` | validation token invention | assert actual `single_active` index | `reference/validation/STEP021A_OR_ISSUE_285.md` |
| OR-ISSUE-286 | Governance flattened multiline runtime signature | validation formatting dependence | assert actual hook type and parameter | `reference/validation/STEP021A_OR_ISSUE_286.md` |
| OR-ISSUE-287 | Combined fixture gate omitted individual identities | documentation traceability | individual headings for 280-284 | `reference/validation/STEP021A_OR_ISSUE_287.md` |

| OR-ISSUE-288 | Current handoff omitted accepted ZIP SHA | continuation evidence | expose accepted version/schema/ZIP/SHA/evidence | `reference/validation/STEP021A_OR_ISSUE_288.md` |
| OR-ISSUE-289 | Failed ER1/ER2 governance froze STEP020D baseline | historical ownership | current accepted STEP020ER3 is dynamic | `reference/validation/STEP021A_OR_ISSUE_289.md` |
| OR-ISSUE-290 | Historical completion governance froze schema 22 | historical schema ownership | retain migration 022, allow schema 23 | `reference/validation/STEP021A_OR_ISSUE_290.md` |

## STEP021B Plan revision, retry and blocker issues

| Issue | Title | Classification | Correction | Evidence |
|---|---|---|---|---|
| OR-ISSUE-291 | Plan revision number lacked immutable definition history | Product data model / revision drift | schema 24 immutable agent_goal_plan_revision_steps snapshots and executor reads only its pinned snapshot | `reference/validation/STEP021B_OR_ISSUE_291.md` |
| OR-ISSUE-292 | Draft controller wrapper could double-admit one Step | Implementation draft / admission ownership | one explicit executor admission result is returned without second base call | `reference/validation/STEP021B_OR_ISSUE_292.md` |
| OR-ISSUE-293 | Delivery failure path referenced transaction-local binding | Static correctness / exception scope | failure path reloads durable delivery state outside transaction scope | `reference/validation/STEP021B_OR_ISSUE_293.md` |
| OR-ISSUE-294 | Generic resume bypassed durable blocker resolution | Product lifecycle / blocker evidence | BLOCKED and FAILED require explicit resolveBlocker or retry with ledger evidence | `reference/validation/STEP021B_OR_ISSUE_294.md` |
| OR-ISSUE-295 | Failed Step terminalized Flow before bounded retry | Product lifecycle / retryability | failure projects durable BLOCKED plus TASK_FAILURE/RETRY_LIMIT blocker while Flow remains resumable | `reference/validation/STEP021B_OR_ISSUE_295.md` |
| OR-ISSUE-296 | Delayed controller wake had no execution revision snapshot | Durable continuation / stale decision | delivery stores all three revisions and mutations reject stale snapshots before writes | `reference/validation/STEP021B_OR_ISSUE_296.md` |
| OR-ISSUE-297 | Start replay rejected an execution pinned to an older Plan revision | Replay identity / revision pinning | replay validates durable owner/controller/Flow binding and preserves the pinned immutable revision | `reference/validation/STEP021B_OR_ISSUE_297.md` |
| OR-ISSUE-298 | Historical STEP021A tests reclaimed current schema and resume semantics | Historical validation ownership | historical schema assertion is additive and BLOCKED resume uses explicit blocker resolution | `reference/validation/STEP021B_OR_ISSUE_298.md` |
| OR-ISSUE-299 | Local Protocol exact capability omitted STEP021B operations | Public protocol acceptance | exact list includes revisePlan/adoptPlanRevision/retry/resolveBlocker | `reference/validation/STEP021B_OR_ISSUE_299.md` |
| OR-ISSUE-300 | Host adoption fixture treated terminal Step currentTaskId as permanent history | Validation projection semantics | assert terminal attempt count and linked Task identity instead of active currentTaskId | `reference/validation/STEP021B_OR_ISSUE_300.md` |
| OR-ISSUE-301 | Historical completion governance froze STEP020ER3 as current baseline | Historical validation ownership | preserve immutable ER1-ER3 evidence and let current STEP validate accepted STEP021A | `reference/validation/STEP021B_OR_ISSUE_301.md` |
| OR-ISSUE-302 | Historical completion governance froze additive schema | Historical schema ownership | retain migration 022 semantics and let current STEP own schema 24 | `reference/validation/STEP021B_OR_ISSUE_302.md` |

## STEP021BR1 Plan revision corrective issues

| Issue | Title | Classification | Correction | Evidence |
|---|---|---|---|---|
| OR-ISSUE-303 | Changed completed Step was preserved by status-only adoption | Product lifecycle / revision identity | semantic immutable Step equality; changed/new Step history resets | `reference/validation/STEP021BR1_OR_ISSUE_303.md` |
| OR-ISSUE-304 | Pinned completion contaminated mutable current Plan state | Revision isolation / projection ownership | mutable projection only for semantically stable definitions | `reference/validation/STEP021BR1_OR_ISSUE_304.md` |
| OR-ISSUE-305 | Open-blocker safety used a bounded presentation query | Lifecycle safety / pagination misuse | dedicated unbounded open-blocker existence query | `reference/validation/STEP021BR1_OR_ISSUE_305.md` |

## STEP021BR2 Windows TAP summary parser issue

| Issue | Title | Classification | Correction | Evidence |
|---|---|---|---|---|
| OR-ISSUE-306 | JavaScript RegExp string consumed the TAP numeric escape | Acceptance Harness / JavaScript string escape | shared line-based integer parser with LF/CRLF regression and historical Harness reuse | `reference/validation/STEP021BR2_OR_ISSUE_306.md` |

| OR-ISSUE-307 | STEP022A | Invalid discovery synthesized a fake capability and exposed filesystem detail | The first draft represented an invalid root with a fabricated tool capability and reused low-level filesystem errors in public diagnostics. | Invalid records now have zero capabilities, use a stable synthetic id, and expose bounded stage-specific messages without absolute paths. | `reference/validation/STEP022A_OR_ISSUE_307.md` |

| OR-ISSUE-308 | STEP022A | Optional env was passed as explicit undefined under exact optional types | The Host constructed an options object with env: undefined instead of omitting the optional property, violating exactOptionalPropertyTypes. | Conditional object spread omits env and other optional fields when absent; workspace build is mandatory before focused tests. | `reference/validation/STEP022A_OR_ISSUE_308.md` |

| OR-ISSUE-309 | STEP022A | Empty extension discovery notice consumed the bounded protocol replay window | The registry published extension.discovered even when no extensions existed, shifting the historical bounded notice sequence and causing a false resync requirement. | The Host publishes extension.discovered only when at least one public record exists; the no-extension protocol fixture retains its original notice window. | `reference/validation/STEP022A_OR_ISSUE_309.md` |

| OR-ISSUE-310 | STEP022A | Extension manifest mutability and unchecked runtime claims weakened the closed contract | The first draft passed nested manifest objects by reference and trusted runtime capability objects after manifest validation. | The Host structured-clones and deep-freezes the manifest, revalidates every claimed capability, rejects undeclared or duplicate claims, and requires every declared capability to be claimed. | `reference/validation/STEP022A_OR_ISSUE_310.md` |

| OR-ISSUE-311 | STEP022A | Extension import and lifecycle calls were unbounded and raw failures could escape | Import, activation, and deactivation could wait indefinitely, and direct extension exceptions risked exposing implementation details. | Import/activation and deactivation have bounded phase timeouts; arbitrary extension exceptions are projected to generic public diagnostics while internal contract failures remain specific. | `reference/validation/STEP022A_OR_ISSUE_311.md` |

| OR-ISSUE-312 | STEP022A | Capability-conflict state could not recover after runtime disable | Both enabled owners of one capability were blocked, but disabling one did not deterministically unblock and activate the remaining owner. | Capability conflicts are recomputed after every enable/disable; released ownership activates newly unblocked configured extensions in sorted order. | `reference/validation/STEP022A_OR_ISSUE_312.md` |

| OR-ISSUE-313 | STEP022A | Repeated configured startup could reactivate an already ready Extension | startConfigured did not explicitly restrict activation to DISCOVERED records, allowing duplicate lifecycle ownership in a repeated startup call. | Only enabled DISCOVERED records activate; READY and FAILED records are stable until explicit lifecycle action, and repeat startConfigured is idempotent. | `reference/validation/STEP022A_OR_ISSUE_313.md` |

| OR-ISSUE-314 | STEP022A | Windows-accepted STEP021BR2 baseline was not propagated to root handoff documents | config/current-accepted-baseline.json was promoted after the real 82/82 Windows run, but root handoff documents still declared STEP021A and 58/58. | Every root continuation document now carries the exact STEP021BR2 step, version, 82/82 checks, artifact SHA, and current STEP022A pending identity. | `reference/validation/STEP022A_OR_ISSUE_314.md` |

| OR-ISSUE-315 | STEP022A | Historical governance tests re-owned the mutable current baseline | Retained STEP020ER1 through STEP021BR2 tests asserted that the mutable current baseline must forever remain STEP021A. | Historical tests now assert only their immutable evidence and structural validity; exact current baseline ownership belongs exclusively to the current STEP022A governance. | `reference/validation/STEP022A_OR_ISSUE_315.md` |

| OR-ISSUE-316 | STEP022A | Extension could spoof MODULE_INVALID to expose an arbitrary diagnostic | The Host classified any thrown object with code MODULE_INVALID as an internal contract failure and surfaced its message. | Only a private ExtensionModuleContractError instance is treated as an internal contract failure; a forged code string is projected as generic ACTIVATION_FAILED. | `reference/validation/STEP022A_OR_ISSUE_316.md` |

| OR-ISSUE-317 | STEP022A | New spoofing regression called a nonexistent fixture helper | The first regression draft called writeExtension although the test file owns createExtension, causing a ReferenceError before exercising Product behavior. | The fixture uses the existing createExtension helper and the focused test is required to fail before the Product fix and pass after it. | `reference/validation/STEP022A_OR_ISSUE_317.md` |

| OR-ISSUE-318 | STEP022A | Historical STEP021BR2 evidence assertion used the wrong field capitalization | rewritten history test invented lowercase evidence tokens | exact immutable uppercase evidence assertion plus cumulative governance | `reference/validation/STEP022A_OR_ISSUE_318.md` |

| OR-ISSUE-319 | STEP022A | Canonical suite ran before the current package manifest was regenerated | preliminary canonical preceded current manifest generation | manifest initial/final ordering and Fresh ZIP verification | `reference/validation/STEP022A_OR_ISSUE_319.md` |

| OR-ISSUE-320 | STEP022A | Legacy materialized Config without extensions crashed Host startup | partial optional chaining assumed every runtime config had the additive block | nested optional chaining, empty defaults, legacy Host fixture | `reference/validation/STEP022A_OR_ISSUE_320.md` |

| OR-ISSUE-321 | STEP022A | Fresh source ZIP export verification ran before build | Source-only validation invoked a generated-output-dependent export gate even though deterministic packaging excludes `dist`. | Fresh source verification stops at source-level gates; install/build precede exports, and governance fixes the ordering contract. | `reference/validation/STEP022A_OR_ISSUE_321.md` |

## STEP022B Durable Connector runtime issues

| Issue | Title | Classification | Correction | Evidence |
|---|---|---|---|---|
| OR-ISSUE-322 | Connector migration referenced nonexistent workspace and Run tables | Schema integration / guessed ownership | removed the nonexistent workspace FK and referenced canonical `agent_runs` | `reference/validation/STEP022B_OR_ISSUE_322.md` |
| OR-ISSUE-323 | Retry fixture did not advance the deterministic clock | Validation fixture / temporal contract | advance the fixture clock through `retryAfterMs` before the next claim | `reference/validation/STEP022B_OR_ISSUE_323.md` |
| OR-ISSUE-324 | Extension fixture treated Conversation list as a paged object | Validation fixture / API shape | consume the actual array returned by `ConversationService.list` | `reference/validation/STEP022B_OR_ISSUE_324.md` |
| OR-ISSUE-325 | Empty connector recovery notice consumed the bounded notice window | Protocol replay / empty event noise | publish `connector.recovered` only when recovery changed durable state | `reference/validation/STEP022B_OR_ISSUE_325.md` |
| OR-ISSUE-326 | Connector account upsert could rebind durable ownership | Identity ownership | existing connector/account identity cannot change Extension or workspace | `reference/validation/STEP022B_OR_ISSUE_326.md` |
| OR-ISSUE-327 | Registered adapter behavior remained mutable | Extension lifecycle / capability integrity | snapshot, bind and freeze the adapter methods at registration | `reference/validation/STEP022B_OR_ISSUE_327.md` |
| OR-ISSUE-328 | Adopted ingress replay ignored changed route or text | Replay identity | compare durable route, Conversation projection and Message text | `reference/validation/STEP022B_OR_ISSUE_328.md` |
| OR-ISSUE-329 | Receipt replay ignored provider conversation and thread identity | Receipt identity | compare all provider identities and receipt hash before replay | `reference/validation/STEP022B_OR_ISSUE_329.md` |
| OR-ISSUE-330 | Public ledger service accepted malformed filter IDs | Service boundary validation | validate connector/account filters before repository access | `reference/validation/STEP022B_OR_ISSUE_330.md` |
| OR-ISSUE-331 | Already-aborted activation could leave a zombie adapter | Lifecycle race / registration | reject an aborted signal before inserting the registration | `reference/validation/STEP022B_OR_ISSUE_331.md` |
| OR-ISSUE-332 | Connector diagnostics exposed Extension-provided error summaries | Diagnostic secrecy | omit payload, claim token and error summary fields from Local Protocol | `reference/validation/STEP022B_OR_ISSUE_332.md` |
| OR-ISSUE-333 | Protocol advertised no connector recovery notice | Public capability completeness | add `connector.recovered` to the accepted notice capability list | `reference/validation/STEP022B_OR_ISSUE_333.md` |
| OR-ISSUE-334 | STEP022B governance invented repository and lifecycle source tokens | Validation precision | assert the actual `StateConnectorRepository`, ternary UNCERTAIN projection, and exact adapter-registration message | `reference/validation/STEP022B_OR_ISSUE_334.md` |
| OR-ISSUE-335 | Historical STEP021B Product tests reclaimed schema 24 as the current global schema | Historical schema ownership | require schema 24 semantics additively while allowing later migrations | `reference/validation/STEP022B_OR_ISSUE_335.md` |
| OR-ISSUE-336 | Cumulative governance ran before the current STEP022B manifest was regenerated | Validation sequencing / manifest ownership | regenerate the current manifest after source and documentation changes before cumulative governance and canonical gates | `reference/validation/STEP022B_OR_ISSUE_336.md` |
| OR-ISSUE-337 | Historical STEP020ER1/ER2 governance froze the current schema at 24 | Historical schema ownership | preserve migration 022 semantics and require only an additive current schema | `reference/validation/STEP022B_OR_ISSUE_337.md` |
| OR-ISSUE-338 | Historical STEP022A governance reclaimed current package, dependencies and root headers | Historical validation ownership | retain immutable STEP022A contract/evidence while STEP022B owns current source and Connector dependency | `reference/validation/STEP022B_OR_ISSUE_338.md` |
| OR-ISSUE-339 | Current manifest generator and verifier still emitted STEP022A identity | Package identity ownership | advance both mutable manifest tools to STEP022B before regeneration | `reference/validation/STEP022B_OR_ISSUE_339.md` |
| OR-ISSUE-340 | Fresh verification selected the extraction directory as workdir before creating it | Validation invocation sequencing | create and extract from an existing parent workdir, then enter the Fresh root | `reference/validation/STEP022B_OR_ISSUE_340.md` |

## STEP022C Mattermost real vertical issues

| Issue | Title | Classification | Correction | Evidence |
|---|---|---|---|---|
| OR-ISSUE-341 | Adopted Connector Run was not scheduled | execution admission ownership | Host callback schedules every adopted Run | `reference/validation/STEP022C_OR_ISSUE_341.md` |
| OR-ISSUE-342 | Terminal Connector output had no delivery projection | completion delivery | idempotent Run-output projection and startup recovery | `reference/validation/STEP022C_OR_ISSUE_342.md` |
| OR-ISSUE-343 | Runtime and Host port construction were circular | Extension lifecycle | register closed delegate, then construct runtime | `reference/validation/STEP022C_OR_ISSUE_343.md` |
| OR-ISSUE-344 | Activation awaited the infinite reconnect loop | lifecycle readiness | background reconnect plus bounded first connection | `reference/validation/STEP022C_OR_ISSUE_344.md` |
| OR-ISSUE-345 | Connector capability could be claimed twice | capability ownership | registerConnector is the sole claim | `reference/validation/STEP022C_OR_ISSUE_345.md` |
| OR-ISSUE-346 | WebSocket startup could exceed activation timeout | timeout composition | first connect deadline is at most eight seconds | `reference/validation/STEP022C_OR_ISSUE_346.md` |
| OR-ISSUE-347 | POST transport error was called NOT_SENT | delivery certainty | post-dispatch errors become MAYBE_ACCEPTED | `reference/validation/STEP022C_OR_ISSUE_347.md` |
| OR-ISSUE-348 | Receipt lacked direct delivery lookup | validation observability | delivery-scoped receipt repository query | `reference/validation/STEP022C_OR_ISSUE_348.md` |
| OR-ISSUE-349 | Adapter diagnostics could leak arbitrary fields | public security boundary | reconstruct closed status and doctor output | `reference/validation/STEP022C_OR_ISSUE_349.md` |
| OR-ISSUE-350 | Doctor did not open a WebSocket | operational proof | bounded open/authentication challenge probe | `reference/validation/STEP022C_OR_ISSUE_350.md` |
| OR-ISSUE-351 | Mention matching accepted username prefixes | routing correctness | boundary-aware exact mention parser | `reference/validation/STEP022C_OR_ISSUE_351.md` |
| OR-ISSUE-352 | Broadcast and post identities could disagree | ingress authenticity | channel/user/team consistency checks | `reference/validation/STEP022C_OR_ISSUE_352.md` |
| OR-ISSUE-353 | Ingress persistence failure was swallowed | loss prevention | retry then 1011 reconnect | `reference/validation/STEP022C_OR_ISSUE_353.md` |
| OR-ISSUE-354 | Diagnostics could forge identity/summary | public contract integrity | registered identity and doctor consistency checks | `reference/validation/STEP022C_OR_ISSUE_354.md` |
| OR-ISSUE-355 | Status/doctor Protocol operations were absent | operability | closed connector.status and connector.doctor | `reference/validation/STEP022C_OR_ISSUE_355.md` |
| OR-ISSUE-356 | WebSocket fixture intercepted Local Protocol | validation isolation | delegate non-Mattermost URLs and static constants | `reference/validation/STEP022C_OR_ISSUE_356.md` |
| OR-ISSUE-357 | Fixture put spaces in a closed profile id | validation contract | valid profile, spaces only in filesystem paths | `reference/validation/STEP022C_OR_ISSUE_357.md` |
| OR-ISSUE-358 | Live check count depended on exception timing | exact acceptance evidence | fixed live check inventory and missing-check fill | `reference/validation/STEP022C_OR_ISSUE_358.md` |
| OR-ISSUE-359 | Historical STEP022B governance reclaimed current root version | historical validation ownership | validate immutable STEP022B contract/package and leave current root identity to STEP022C | `reference/validation/STEP022C_OR_ISSUE_359.md` |
| OR-ISSUE-360 | Historical STEP022B froze Connector operations at four | historical protocol ownership | assert retained four operations while current STEP owns additive operations | `reference/validation/STEP022C_OR_ISSUE_360.md` |
| OR-ISSUE-361 | Historical STEP022A fixture compatibility expired | historical fixture compatibility | broad fixture range; dedicated compatibility tests own rejection | `reference/validation/STEP022C_OR_ISSUE_361.md` |
| OR-ISSUE-362 | Current Local Protocol fixture omitted status/doctor | current public protocol acceptance | add both operations to the exact sorted capability list | `reference/validation/STEP022C_OR_ISSUE_362.md` |
| OR-ISSUE-363 | STEP022B governance required obsolete exact-operation wording | validation semantic drift | align meta-governance with retained-capability semantics | `reference/validation/STEP022C_OR_ISSUE_363.md` |
| OR-ISSUE-364 | Single-process canonical validation exceeded outer tool-call window | validation execution environment | deterministic contiguous groups through the unchanged runner plus exact inventory equivalence | `reference/validation/STEP022C_OR_ISSUE_364.md` |
| OR-ISSUE-365 | Container streaming session mode unavailable for official aggregate | validation execution environment | detached process with explicit PID/log/exit-code files and unchanged acceptance command | `reference/validation/STEP022C_OR_ISSUE_365.md` |

## STEP022CR2 integrated Mattermost Testbed issues

| Issue | Title | Classification | Correction | Evidence |
|---|---|---|---|---|
| OR-ISSUE-366 | Separate Testbed root required an invented OpenRill directory | validation packaging / path ownership | integrate under `testbeds/mattermost` and derive root internally | `reference/validation/STEP022CR2_OR_ISSUE_366.md` |
| OR-ISSUE-367 | PowerShell-only launch syntax was given to a CMD prompt | Windows entrypoint / shell mismatch | root `.cmd` wrapper plus zero-argument `.ps1` | `reference/validation/STEP022CR2_OR_ISSUE_367.md` |
| OR-ISSUE-368 | Testbed claimed a stale Mattermost image as current ESR | external dependency evidence | pin verified exact Team Edition `11.7.7`; forbid `latest` | `reference/validation/STEP022CR2_OR_ISSUE_368.md` |
| OR-ISSUE-369 | Product ZIP alone could not execute its next real Live gate | continuation completeness | bundle real Testbed and operations inside the full source ZIP | `reference/validation/STEP022CR2_OR_ISSUE_369.md` |
| OR-ISSUE-370 | Testbed regression assumed caller cwd was repository root | validation fixture / path independence | derive root from `import.meta.url` and test from external cwd | `reference/validation/STEP022CR2_OR_ISSUE_370.md` |
| OR-ISSUE-371 | Canonical reconciliation mixed absolute and relative path identities | validation evidence / path normalization | normalize both sets to repository-relative POSIX paths before comparison | `reference/validation/STEP022CR2_OR_ISSUE_371.md` |

## STEP022CR3 Windows CMD entrypoint byte-contract issue

| Issue | Title | Classification | Correction | Evidence |
|---|---|---|---|---|
| OR-ISSUE-372 | Windows CMD entrypoint content was not byte-verified | Windows packaging / executable entrypoint byte contract | generate ASCII CRLF direct CMD entrypoints and verify exact bytes before and after ZIP creation | `reference/validation/STEP022CR3_OR_ISSUE_372.md` |
| OR-ISSUE-373 | New recurrence gate omitted its issue identifier | validation governance / evidence linkage | bind the recurrence section explicitly to OR-ISSUE-372 and retain this failure independently | `reference/validation/STEP022CR3_OR_ISSUE_373.md` |
| OR-ISSUE-374 | Historical STEP022CR2 test froze the PowerShell wrapper implementation | historical validation ownership / implementation detail | retain zero-argument same-root CMD semantics while CR3 owns the direct byte contract | `reference/validation/STEP022CR3_OR_ISSUE_374.md` |
| OR-ISSUE-375 | Overlapping acceptance cleanup invalidated an orphan canonical process | validation execution concurrency / cleanup ownership | forbid overlapping aggregates and check/terminate orphan processes before a new cleanup/build | `reference/validation/STEP022CR3_OR_ISSUE_375.md` |

## STEP023A Periodic maintenance physical retention issues

| Issue | Title | Classification | Correction | Evidence |
|---|---|---|---|---|
| OR-ISSUE-376 | Retention expiry alone could authorize unsafe physical deletion | retention safety / reference protection | inspect current Run, Task, Flow, Goal, blocker, completion-delivery and Connector dependencies immediately before delete; delete only a terminal due entity with zero protections | `reference/validation/STEP023A_OR_ISSUE_376.md` |
| OR-ISSUE-377 | Connector delivery had no durable cleanup schedule | schema / retention lifecycle | schema 26 adds connector_deliveries.cleanup_after and schedules only safe DELIVERED/SUPPRESSED deliveries | `reference/validation/STEP023A_OR_ISSUE_377.md` |
| OR-ISSUE-378 | Physical prune had no durable cross-Host ownership | maintenance concurrency / lease ownership | maintenance_leases provides expiring owner/token leases and every delete transaction verifies current lease ownership | `reference/validation/STEP023A_OR_ISSUE_378.md` |
| OR-ISSUE-379 | Cascade deletion could erase evidence before a durable prune marker | audit durability / delete ordering | write a minimal hashed retention tombstone in the same transaction before deleting the root ledger row | `reference/validation/STEP023A_OR_ISSUE_379.md` |
| OR-ISSUE-380 | Ambiguous Connector delivery history could be auto-pruned | delivery certainty / retention safety | UNCERTAIN/DEAD work and OPEN dead letters remain protected; DELIVERED requires a durable provider receipt | `reference/validation/STEP023A_OR_ISSUE_380.md` |
| OR-ISSUE-381 | Periodic retention reused reconcile APPLY and could mutate unrelated lifecycle state | responsibility separation / maintenance | add scheduleRetention APIs so periodic retention schedules cleanup without Task LOST or Flow cancellation reconciliation | `reference/validation/STEP023A_OR_ISSUE_381.md` |
| OR-ISSUE-382 | Completed final retention page returned a stale input cursor | pagination / continuation correctness | return null at end-of-scan and only return the last processed cursor when another page or lease-loss continuation exists | `reference/validation/STEP023A_OR_ISSUE_382.md` |
| OR-ISSUE-383 | Tombstone conflict could permit deletion without fresh evidence | audit identity / fail-closed deletion | remove ON CONFLICT DO NOTHING; a tombstone primary-key collision aborts the transaction and preserves the entity | `reference/validation/STEP023A_OR_ISSUE_383.md` |
| OR-ISSUE-384 | Historical STEP004 test froze the complete Local Protocol operation list | historical validation ownership | assert retained STEP004 operations plus no duplicates while allowing later additive operations | `reference/validation/STEP023A_OR_ISSUE_384.md` |
| OR-ISSUE-385 | Historical STEP020D Host test froze global startup retention behavior | historical validation ownership | disable STEP023A auto-arm in the STEP020D fixture so it tests only STEP020D reconciliation semantics | `reference/validation/STEP023A_OR_ISSUE_385.md` |
| OR-ISSUE-386 | Retention scheduling could starve unscheduled rows beyond an already-scheduled prefix | bounded-query starvation / scheduling | query unscheduled terminal Tasks and Flows directly instead of scanning the first generic history page | `reference/validation/STEP023A_OR_ISSUE_386.md` |
| OR-ISSUE-387 | SQLite changes value was treated as number-only | TypeScript / sqlite compatibility | convert statement result changes through Number(...) before arithmetic | `reference/validation/STEP023A_OR_ISSUE_387.md` |
| OR-ISSUE-388 | Focused Goal fixture guessed a nonexistent agent_goals title column | validation fixture / schema precision | use the actual objective column from schema instead of inferred naming | `reference/validation/STEP023A_OR_ISSUE_388.md` |
| OR-ISSUE-389 | Tombstone redaction test confused generated fixture identifiers with retained payload | validation fixture / privacy assertion | assert the exact public tombstone key set and absence of payload fields rather than substring-matching generated ids | `reference/validation/STEP023A_OR_ISSUE_389.md` |
| OR-ISSUE-390 | Lease-loss test clock advanced slowly enough for proactive renewal | validation fixture / temporal contract | force an abrupt deterministic clock jump so the test actually loses ownership before the next delete | `reference/validation/STEP023A_OR_ISSUE_390.md` |
| OR-ISSUE-391 | Periodic sweep could repeatedly scan a protected prefix and starve later eligible history | periodic cursor durability / starvation | persist the deterministic retention cursor in maintenance_sweep_state and resume it across intervals and Host restarts with revision-CAS advancement | `reference/validation/STEP023A_OR_ISSUE_391.md` |
| OR-ISSUE-392 | STEP023A governance guessed source wording and deletion implementation details | validation precision / source-token ownership | assert actual contract wording, schema constant, dynamic delete order and optional Config syntax | `reference/validation/STEP023A_OR_ISSUE_392.md` |
| OR-ISSUE-393 | Historical STEP022B schema test reclaimed current schema 25 | historical schema ownership | prove schema-25 semantics at migration 25 and allow later additive migrations | `reference/validation/STEP023A_OR_ISSUE_393.md` |
| OR-ISSUE-394 | Historical STEP022B governance froze the global schema constant at 25 | historical governance / schema ownership | retain migration-25 evidence and allow later additive schema versions | `reference/validation/STEP023A_OR_ISSUE_394.md` |
| OR-ISSUE-395 | Historical STEP022C governance reclaimed current root and manifest identity | historical governance / source identity ownership | own immutable STEP022C contract/package only; later STEP owns mutable root identity | `reference/validation/STEP023A_OR_ISSUE_395.md` |
| OR-ISSUE-396 | STEP022CR2 validation corrective froze Product root version after later development | historical validation corrective / identity ownership | validate retained STEP022C contract and Testbed semantics without freezing current root version | `reference/validation/STEP023A_OR_ISSUE_396.md` |
| OR-ISSUE-397 | Mutable package manifest tools retained STEP022C while STEP023A version advanced | package identity ownership / repeated partial version advance | align both mutable manifest tools to exact STEP023A step and version before regeneration | `reference/validation/STEP023A_OR_ISSUE_397.md` |
| OR-ISSUE-398 | Historical STEP022B Host fixture compatibility expired at the next Product version | historical fixture compatibility / current Host version ownership | remove the unrelated upper Host-version bound; dedicated compatibility tests own rejection | `reference/validation/STEP023A_OR_ISSUE_398.md` |
| OR-ISSUE-399 | Historical STEP022CR3 byte-contract test reclaimed the current Product root version | historical corrective validation ownership / current Product identity | validate CR3 immutable package baseline inside CR3-owned assets, not current root version | `reference/validation/STEP023A_OR_ISSUE_399.md` |
| OR-ISSUE-400 | STEP023A acceptance stopped checking issue evidence at OR-ISSUE-392 | acceptance evidence completeness / recurrence governance | advance acceptance and governance issue ranges atomically with every new issue | `reference/validation/STEP023A_OR_ISSUE_400.md` |
| OR-ISSUE-401 | Orphan-process preflight matched its own shell command text | validation process ownership / false-positive preflight | use exact argv identity and exclude current process ancestry | `reference/validation/STEP023A_OR_ISSUE_401.md` |
| OR-ISSUE-402 | STEP023A acceptance imported report writer from the wrong module | acceptance entrypoint / shared helper ownership | import run_stage and write_acceptance_report from their actual separate owner modules | `reference/validation/STEP023A_OR_ISSUE_402.md` |
| OR-ISSUE-403 | Fresh verification again selected a not-yet-created extraction directory as workdir | Fresh ZIP validation sequencing / recurrence of OR-ISSUE-340 | use the dedicated verifier from an existing workdir to own create/extract/check/repack order | `reference/validation/STEP023A_OR_ISSUE_403.md` |
| OR-ISSUE-404 | Fresh-verifier governance guessed a nonexistent source token | validation governance / source-token inference | assert actual verifier call structure instead of formatting-specific guessed text | `reference/validation/STEP023A_OR_ISSUE_404.md` |
## STEP023AR1 GitHub publishing source-hygiene issues

| Issue | Title | Classification | Correction | Evidence |
|---|---|---|---|---|
| OR-ISSUE-405 | Git transport did not own the Windows CMD CRLF byte contract | Git transport / Windows executable byte contract | add repository-owned `.gitattributes` with `*.cmd text eol=crlf` | `reference/validation/STEP023AR1_OR_ISSUE_405.md` |
| OR-ISSUE-406 | `.gitignore` covered `.env` but not the broader local-secret filename family | source publication / credential hygiene | ignore `.env.*` and private key/certificate shapes while retaining example env files | `reference/validation/STEP023AR1_OR_ISSUE_406.md` |
| OR-ISSUE-407 | Referenced OpenClaw MIT evidence could be mistaken for an OpenRill license | repository publication / license ownership | document that OpenRill has no inferred license and keep public open-source status explicit | `reference/validation/STEP023AR1_OR_ISSUE_407.md` |
| OR-ISSUE-408 | Browser upload is the wrong transport for the complete source tree | repository publication / transport completeness | use one reviewed Git commit/push to a new empty GitHub repository; keep generated ZIPs in Releases | `reference/validation/STEP023AR1_OR_ISSUE_408.md` |
| OR-ISSUE-409 | Broad Git EOL normalization would invalidate source-manifest byte identity | Git transport / package-manifest byte identity | preserve all tracked bytes by default and opt in only the four root CMD CRLF contracts | `reference/validation/STEP023AR1_OR_ISSUE_409.md` |
| OR-ISSUE-410 | Git clone byte comparator included generated files outside the package boundary | publication validation / source-boundary equivalence | compare source/clone bytes using the exact manifest inclusion/exclusion boundary | `reference/validation/STEP023AR1_OR_ISSUE_410.md` |

