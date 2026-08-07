# STEP011 — CONTROL_UI_VERTICAL_SLICE

## 목적

STEP010A에서 선택한 Vue 3를 실제 packaged browser runtime으로 도입하고 Conversation, stream, Tool, Approval, Artifact의 첫 완전한 Host-to-browser 수직 흐름을 닫는다.

## 기준선

```text
previous=STEP010AR1_WINDOWS_UNIT_SUITE_DETERMINISM_AND_FAILURE_EVIDENCE
previousVersion=0.10.3-step010ar1
previousWindows=ACCEPTED 121/121
schema=7
framework=VUE_3
```

## Reference Evidence

- `[OC-UI-001] ui/src/api/gateway.ts:306-318` — independent browser Gateway client.
- `[OC-UI-002] ui/src/app-routes.ts:23` — independent Approvals route.
- `[OC-UI-003] ui/src/app-routes.ts:26` — route-oriented Chat surface.

OpenClaw is reference evidence only. No source or dependency is copied.

## OpenClaw 문제 분석

OpenClaw confirms that browser protocol ownership, independent Approval routes and route-oriented chat are viable. It does not define OpenRill's protocol, token bootstrap, Artifact authority or Vue choice. OpenRill keeps those contracts Product-owned.

## 구현 범위

- Vue 3.5.40 same-origin packaged runtime and immutable runtime lock.
- routes: Conversations, Workspaces, Skills, Approvals, Artifacts, Settings, Diagnostics.
- framework-neutral Local Protocol client and projection.
- Conversation create/send, optimistic submission key and live text/Tool cards.
- Approval list, deep link and allow/deny actions.
- public Workspace/Artifact Local Protocol operations.
- authenticated bounded Artifact content HTTP.
- Host static assets, no-store bootstrap, CSP and loopback same-origin policy.
- duplicate suppression, gap detection, snapshot resync and reconnect cursor.
- bounded transcript, keyboard/accessibility and mobile-width smoke.
- separate Host + local model provider + real Chromium vertical-slice acceptance.

## 공개 계약

`docs/contracts/CONTROL_UI.md` and `docs/adrs/ADR-0028-CONTROL_UI_VERTICAL_SLICE.md` are normative. The UI does not access SQLite, Workspace paths, Artifact storage paths or process APIs directly.

## 상태 전이

```text
BOOTSTRAPPING
→ CONNECTING
→ CONNECTED
→ RESYNC_REQUIRED | DISCONNECTED
→ RESYNCING | reconnect backoff
→ CONNECTED
```

Conversation execution remains Host-owned:

```text
conversation.send
→ RUNNING
→ WAITING_APPROVAL
→ approval.resolve allow_once
→ RUNNING
→ Tool/Artifact notices
→ COMPLETED
```

## 실패 및 복구

- submit before confirmed send is `SENDING`; failure is `NOT_SENT`.
- duplicate notices do not mutate projection.
- gaps keep the last applied cursor and require snapshot resync.
- stale Approval version is returned as a conflict and the list is reloaded.
- missing/oversized/private Artifact content is not exposed.
- connection loss uses bounded reconnect backoff and stored non-secret cursor.
- unknown notice types remain visible.

## Acceptance

- actual packaged Vue 3.5.40 runtime/hash/license.
- initial bootstrap and CSP.
- Conversation create/send.
- live `model.text_delta` projection.
- process Tool approval through browser `allow_once`.
- Workspace write and Artifact creation/open.
- reload cursor resume and credential-free localStorage.
- sequence-gap unit resync.
- duplicate notice and unknown fallback.
- 390 px mobile smoke.
- keyboard/accessibility landmarks.
- framework isolation architecture gate.
- previous live regression and full serial unit suite.

## 반복 방지 기록

- OR-ISSUE-037: live progress envelope vocabulary drift.
- OR-ISSUE-038: notice gap cursor advancement/replay-base mismatch.

Each issue has a Registry row, detailed validation document and automated recurrence gate.

## 패키징 산출물

- deterministic source acceptance report.
- byte-identical ZIP double build and SHA-256.
- final fresh-ZIP acceptance and manifest verification.
- README/HANDOFF/PLANS/ROADMAP/VALIDATION coherence.

## 제외

- desktop shell;
- plugin UI;
- remote/non-loopback hosting;
- production account/auth system;
- arbitrary Artifact MIME rendering;
- full design system.

## 완료 선언

Only after the real packaged Vue runtime and separate Chromium vertical slice pass may the package declare:

```text
STEP011_CONTROL_UI_VERTICAL_SLICE state=PASSED framework=VUE_3 browser=CHROMIUM
```

Static analysis or a mocked Vue runtime is insufficient.
