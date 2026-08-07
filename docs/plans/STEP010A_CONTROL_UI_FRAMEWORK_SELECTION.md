# STEP010A — CONTROL_UI_FRAMEWORK_SELECTION

## 목적

실제 OpenRill UI 요구를 동일한 immutable fixture와 framework-neutral package contract로 검증해 Control UI 프레임워크를 선택하고, 선택 근거를 독립 ADR로 고정한다.

## 기준선

```text
previous=STEP010R1_WINDOWS_SYMLINK_CAPABILITY_AND_SUITE_DIAGNOSTICS
previousVersion=0.10.1-step010r1
previousWindows=116/116 ACCEPTED
current=STEP010A_CONTROL_UI_FRAMEWORK_SELECTION
currentVersion=0.10.3-step010ar1
schema=7
```

제품 DB schema, Host API, Local Protocol wire contract는 변경하지 않는다.

## Reference Evidence

- `[OC-UI-001] ui/src/api/gateway.ts:306` — Control UI가 독립 Gateway browser client를 사용한다.
- `[OC-UI-002] ui/src/app-routes.ts:23` — 승인 화면이 독립 route이다.
- `[OC-UI-003] ui/src/app-routes.ts:26` — 대화 화면이 route module로 분리된다.
- `[OC-UI-004] ui/package.json:38` — OpenClaw의 현재 UI runtime은 Lit 3.3.3이다.
- `[OC-UI-005] ui/package.json:32-33` — 긴 transcript에 TanStack Lit virtualization을 사용한다.
- `[OC-UI-006] ui/package.json:46-52` — Vite/Vitest browser/Playwright 기반 build·browser test stack을 사용한다.

OpenClaw 코드는 reference evidence이며 dependency/import/copy 대상이 아니다.

## 후보 축소

서면 후보군은 React, Vue 3, Lit, Solid, Svelte다. repository workload와 구현 축을 기준으로 finalist를 두 개로 제한한다.

```text
Vue 3 = app-framework finalist
Lit 3 = Web Component finalist
```

React/Solid/Svelte는 기술적으로 불가능해서 제외한 것이 아니다. 현재 OpenRill 코드와 다음 단계 workload에서 세 번째 후보가 비교 축을 추가로 넓히지 못해 finalist 구현 대상에서 제외한다.

## 구현 범위

- `apps/agent-web/spikes/shared/*`
- `apps/agent-web/spikes/vue/*`
- `apps/agent-web/spikes/lit/*`
- `apps/agent-web/src/control-ui-projection.ts`
- `config/ui-framework.json`
- `scripts/run-step010a-spikes.mjs`
- `tests/unit/control-ui-framework-step010a.test.mjs`
- `docs/ui/FRAMEWORK_EVALUATION.md`
- `docs/adrs/ADR-0027-CONTROL_UI_FRAMEWORK_VUE3.md`
- `reference/openclaw/CONTROL_UI_FRAMEWORK_SELECTION.md`

## 공통 fixture

```text
fixtureId=openrill-control-ui-step010a-v1
fixtureSha256=45ca6118a68277140ef84c9f0ccaa6fd8fd978e38ac5565741fa46066650cd57
noticeCount=9
```

동일 fixture가 다음을 포함한다.

- conversation update
- Run `CREATED → RUNNING → COMPLETED`
- streaming text delta
- Tool started card
- pending Approval card
- Artifact card
- unknown event fallback
- reconnect cursor

## 구현 상세

1. production `@openrill/web`에 framework-neutral projection/reconnect contract를 export한다.
2. Vue 3.5.40과 Lit 3.3.3 spike가 동일 fixture와 DOM contract를 소비한다.
3. duplicate notice는 무시하고 sequence gap은 `SNAPSHOT_RESYNC`로 전이한다.
4. 10,000행 transcript에서 bounded virtual window를 계산한다.
5. ArrowUp/ArrowDown roving focus와 banner/main/log/status landmark를 검증한다.
6. finalist source/build/runtime metadata를 같은 runner로 측정한다.
7. 100점 weight와 1~5 score matrix를 canonical JSON SHA-256으로 결합한다.
8. `config/ui-framework.json`, public package contract, ADR, architecture marker를 동일한 `VUE_3`로 정렬한다.
9. production Vue dependency와 bundler는 STEP011까지 추가하지 않는다.

## 공개 계약

```text
UI_FRAMEWORK_SELECTION=VUE_3
UI_FRAMEWORK_DECISION_STEP=STEP010A
UI_RUNTIME_INTRODUCTION_STEP=STEP011
stateAccess=LOCAL_PROTOCOL_ONLY
directDatabaseAccess=false
```

Framework-specific type은 Local Protocol, State, Host, service public contract에 노출하지 않는다.

## 상태 전이

Projection notice 처리:

```text
sequence <= cursor       → DUPLICATE
sequence == cursor + 1   → APPLIED
sequence > cursor + 1    → GAP + SNAPSHOT_RESYNC
snapshot applied         → CURSOR_RESUME
```

Framework decision:

```text
DEFERRED
→ shared workload accepted by two finalists
→ hash-bound decision matrix
→ VUE_3 Accepted ADR
→ production runtime still absent until STEP011
```

## 측정 의미

STEP010A runner는 candidate-owned source와 deterministic static build output을 측정한다. 외부 ESM runtime byte는 exact pinned metadata로 기록하되 third-party runtime을 ZIP에 재패키징하지 않는다.

따라서 STEP010A가 선언하는 것은 framework selection과 binding contract 완료다. 실제 packaged Vue runtime, Vite build, browser component/E2E는 STEP011 범위다.

## 실패 및 복구

- 두 finalist가 동일 fixture contract를 통과하지 못하면 선택하지 않는다.
- matrix weight가 100이 아니거나 signature가 다르면 실패한다.
- public contract, config, ADR, architecture output이 다르면 실패한다.
- production manifest/lockfile에 Vue 또는 Lit runtime이 조기 추가되면 실패한다.
- framework import가 Local Protocol client로 역류하면 실패한다.
- generated `.artifacts/step010a`는 acceptance 종료 시 제거한다.

## Acceptance

- 동일 fixture identity/hash
- stream/tool/approval/artifact/unknown projection
- duplicate suppression
- reconnect cursor와 sequence-gap resync
- 10,000행 virtualization smoke
- keyboard/accessibility contract
- Vue/Lit exact runtime pins
- deterministic finalist static production-mode build
- compiled `@openrill/web` projection parity
- no framework dependency outside `apps/agent-web`
- no production framework dependency before STEP011
- signed decision matrix
- Accepted Vue ADR
- architecture marker `ui_framework=VUE_3`
- full unit/build/architecture/export regression
- OpenClaw evidence `122/122`
- fresh-ZIP acceptance

## 반복 방지 기록

STEP010A에서 실제 확인된 architecture decision drift는 다음 세트를 갖는다.

```text
OR-ISSUE-033 architecture decision drift
OR-ISSUE-034 schema owner-file assertion
+ detailed validation documents
+ automated recurrence gates
```

## 패키징 산출물

- deterministic source ZIP
- ZIP SHA-256
- package manifest
- acceptance report
- framework evaluation report
- accepted ADR
- shared fixture and matrix hashes
- OpenClaw evidence report

## 제외

- 완성된 Control UI
- production Vue/Vite dependency
- 실제 browser E2E
- desktop shell
- plugin UI

## 완료 선언

동일 fixture의 deterministic contract, 두 finalist source/build evidence, decision matrix, Accepted ADR, full regression과 fresh-ZIP acceptance가 모두 통과한 뒤에만 STEP010A deterministic 완료를 선언한다. 실제 production browser vertical slice는 STEP011에서 별도로 수용한다.
