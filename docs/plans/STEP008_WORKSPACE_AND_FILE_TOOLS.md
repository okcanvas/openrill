# STEP008 — WORKSPACE_AND_FILE_TOOLS

## 목적

Windows-live-accepted STEP007 Agent Kernel에 명시적으로 등록된 local Workspace 권한과 bounded file Tool을 연결한다. Model은 host absolute path를 받지 않고, Run의 workspace identity와 root-relative path만 사용한다.

## 기준선

```text
input baseline = STEP007_AGENT_KERNEL_AND_MODEL_ADAPTER
input version = 0.7.0-step007
input Windows live = ACCEPTED (112/112)
output version = 0.8.0-step008
SQLite schema = 5
```

## Reference Evidence

- `OC-SANDBOX-003` — workspace authority를 policy/backend/tool surface와 함께 검증한다.
- `OC-FILE-001` — apply_patch는 기본 workspace-contained다.
- `OC-FILE-002` — read Tool은 workspace root guard를 적용한다.
- `OC-FILE-003` — 동일 real file mutation을 직렬화한다.
- `OC-FILE-004` — read output은 byte/line 상한을 갖는다.
- `OC-FILE-005` — edit replacement는 exact original text를 요구한다.

전체 외부 원본 검증은 `118/118 VERIFIED`다.

## OpenClaw 문제 분석

OpenClaw는 다양한 sandbox/host Tool, absolute path 해석, policy 조합을 지원한다. OpenRill STEP008은 그 구현을 복사하지 않는다. 제품 경계를 더 좁게 고정한다.

- Run이 하나의 configured Workspace를 소유한다.
- Model은 Workspace ID를 바꾸거나 absolute path를 제출할 수 없다.
- Shell, process, arbitrary filesystem, sandbox backend는 포함하지 않는다.
- file mutation은 optimistic revision과 private Artifact 증거를 필수화한다.

## 구현 범위

### `@openrill/workspace`

- Workspace catalog/registration
- canonical root와 duplicate-root 검사
- portable relative path grammar
- ignored/secret-like path policy
- existing target와 nearest ancestor realpath confinement
- read-only write denial
- symlink/junction escape rejection

### `@openrill/tools-files`

- `workspace.list`
- `workspace.stat`
- `workspace.read`
- `workspace.search`
- `workspace.write`
- `workspace.patch`
- same-file mutation queue
- atomic text replacement
- compact diff
- private Artifact store

### State/Host

- migration `005_workspace_file_artifacts.sql`
- `workspace_registrations`
- `workspace_artifacts`
- Host startup registration persistence
- populated ToolRegistry injection into AgentRunCoordinator
- Artifact metadata foreign-key binding

## 공개 계약

- public file reference: `{workspaceId, relativePath}`
- access mode: `READ_ONLY | READ_WRITE`
- trust state: `CONFIGURED_LOCAL`
- revision: `MISSING | sha256:<64 hex>`
- expected policy/conflict error: `isError=true` plus stable code
- absolute canonical root and Artifact storage path remain private state

상세 계약:

- `docs/contracts/WORKSPACE.md`
- `docs/contracts/FILE_TOOLS.md`
- `docs/adrs/ADR-0024-WORKSPACE_RELATIVE_FILE_AUTHORITY.md`

## 상태 전이

Workspace registration:

```text
CONFIG source
→ root existence/type check
→ realpath canonicalization
→ duplicate-root rejection
→ workspace_registrations upsert
→ Host READY
```

Mutation:

```text
Tool input validation
→ Workspace authority resolve
→ same-file queue
→ current revision read
→ expected revision check
→ replacement/patch compute
→ same-directory temp write + fsync
→ authority/revision recheck
→ atomic rename
→ FILE_CHANGE Artifact
→ workspace_artifacts insert
→ Tool result
```

## 실패 및 복구

- traversal/absolute/non-portable path: mutation before rejection
- symlink/junction escape: `WORKSPACE_SYMLINK_ESCAPE`
- read-only write: `WORKSPACE_ACCESS_DENIED`
- invalid UTF-8/NUL content: `WORKSPACE_BINARY_FILE_DENIED`
- stale revision/mtime: `WORKSPACE_REVISION_CONFLICT`
- exact patch mismatch: `WORKSPACE_PATCH_CONFLICT`, zero partial changes
- missing parent: no implicit directory creation
- Artifact write failure: partial Artifact cleanup
- mutation temp failure: original target retained and temp cleanup
- oversized output: bounded Tool output plus private Artifact

## Acceptance

- canonical registration and duplicate root
- public absolute-path leak zero
- six exact Tool definitions
- read-only deny
- absolute, `..`, ignored, secret-like path deny
- symlink/junction escape deny
- binary read deny
- bounded read/search and Artifact
- atomic create/replace
- stale revision conflict
- same-file concurrent write one winner
- patch all-or-nothing
- diff and Artifact metadata
- schema 5 registration/artifact ledger
- actual Host + local Responses provider read/write/patch loop
- Unicode/long Workspace path
- secret value absent from SQLite
- STEP006/STEP007 live regression
- build/unit/architecture/export
- external OpenClaw evidence `118/118`
- clean deterministic package and fresh-ZIP rerun

## 반복 방지 기록

STEP008에서 확인한 실제 결함:

```text
OR-ISSUE-013 baseline document drift
OR-ISSUE-014 Artifact root initialization ownership
OR-ISSUE-015 incomplete schema-derived expectation repair
OR-ISSUE-016 asymmetric evidence whitespace normalization
OR-ISSUE-017 same-file optimistic mutation race
OR-ISSUE-018 package manifest release identity drift
OR-ISSUE-019 synthetic secret fixture literal
```

각 항목은 Registry, `reference/validation` 상세 문서, acceptance gate를 모두 갖는다.

## 패키징 산출물

```text
openrill-step008-workspace-file-tools-v1.zip
openrill-step008-workspace-file-tools-v1.zip.sha256.txt
```

ZIP에는 `node_modules`, `dist`, `.artifacts`, runtime DB/WAL/SHM, Host metadata/lock, Secret/API key, user Workspace payload를 포함하지 않는다.

## 제외

- mkdir/delete/move/copy Tool
- Shell/process Tool
- Git Tool
- sandbox backend
- cross-process filesystem lock protocol
- arbitrary binary/media editing

## 완료 선언

Deterministic acceptance와 fresh-ZIP acceptance가 각각 `187/187 PASSED`이므로 STEP008 packaged deterministic baseline을 선언한다. 실제 Windows 명령 결과 전에는 Windows live accepted로 선언하지 않는다.
