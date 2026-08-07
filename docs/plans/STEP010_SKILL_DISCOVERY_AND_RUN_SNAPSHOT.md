# STEP010 — SKILL_DISCOVERY_AND_RUN_SNAPSHOT

## 목적

bundled, managed-user, Workspace Skill을 안전하게 탐색하고 선택된 instructions/resources를 Run 단위 immutable snapshot으로 고정한다.

## 기준선

```text
Input:  STEP009_PROCESS_TOOL_AND_APPROVAL_RESUME
        version=0.9.0-step009
        schema=6
        Windows live=ACCEPTED 217/217
Output: STEP010_SKILL_DISCOVERY_AND_RUN_SNAPSHOT
        version=0.10.0-step010
        schema=7
```

## Reference Evidence

- `[OC-SKILL-001] src/skills/loading/skill-contract.ts:4`
- `[OC-SKILL-002] src/skills/loading/skill-contract.ts:38`
- `[OC-SKILL-003] src/skills/loading/local-loader.ts:115`
- `[OC-SKILL-004] src/skills/loading/workspace.ts:1751`
- `[OC-SKILL-005] src/skills/loading/workspace.ts:1671`

외부 원본 전체 evidence는 `120/120 VERIFIED`다.

## OpenClaw 문제 분석

OpenClaw는 metadata, prompt formatting, root-contained loader, precedence, Run snapshot prompt를 분리한다. OpenRill은 이 경계만 근거로 삼고 자체 strict manifest, schema ledger, private snapshot store를 구현한다. OpenClaw code나 dependency는 사용하지 않는다.

## 구현 범위

- `@openrill/skills` strict parser/discovery/selection/snapshot
- bundled example `workspace-review`
- schema migration `007_skill_discovery_run_snapshot.sql`
- State Skill repository
- Host `SkillRunService`
- Kernel 전 system instructions resolution
- 별도 Host/provider/WebSocket live fixture

## 공개 계약

Manifest key는 `id/version/description/activation/instructions/tools/resources/compatibility`다. Source는 `BUNDLED|MANAGED_USER|WORKSPACE`, precedence는 10/20/30이다. catalog는 content를 포함하지 않으며 activation 이후 snapshot에서 lazy load한다.

## 상태 전이

```text
Run CREATED
→ Skill source discovery/validation
→ deterministic activation selection
→ manifest/instructions/resources capture
→ skill_run_contexts + skill_snapshots commit
→ Agent Kernel RUNNING
```

같은 Run 재개:

```text
skill_run_contexts exists
→ source rediscovery 없음
→ snapshot file/hash 검증
→ 동일 system instructions
```

## 실패 및 복구

- invalid Skill은 diagnostic 후 격리
- source escape/symlink/binary/limit 위반은 fail closed
- discovery와 capture 사이 manifest 변경은 `SKILL_SNAPSHOT_INCONSISTENT`
- snapshot 준비 실패는 Run/Attempt `FAILED`, reason `SKILL_PREPARATION_FAILED`
- 원본 삭제 후에도 과거 snapshot load 가능
- 같은 Run/Skill concurrent capture는 직렬화

## Acceptance

- valid bundled/managed/workspace discovery
- invalid ID/version/unknown field
- missing instructions/resource escape/symlink escape
- required Tool unavailable
- precedence와 shadow diagnostics
- enabled allowlist
- metadata-only lazy content load
- source revision content sensitivity
- manifest discovery-to-capture binding
- immutable hash snapshot
- mid-Run 변경 무시, next-Run refresh
- 원본 삭제 후 과거 snapshot load
- concurrent capture exactly one
- pre-Kernel failure durable terminal state
- schema-7 source/diagnostic/context/snapshot ledger
- separate Host/provider live Run snapshot reuse
- STEP006~009 live regression

## 반복 방지 기록

STEP010은 `OR-ISSUE-024`부터 `OR-ISSUE-028`까지 등록한다. 각 이슈는 Registry row, 상세 failure evidence, automated recurrence gate를 갖는다.

## 패키징 산출물

- deterministic source ZIP과 SHA-256
- package manifest와 verification report
- source/fresh-ZIP acceptance report
- README/HANDOFF/PLANS/ROADMAP/VALIDATION
- contracts/ADR/OpenClaw analysis/Issue Registry

## 제외

remote registry, marketplace, workshop, executable Skill, dependency installation, user ZIP upload, OpenClaw compatibility parser.

## 완료 선언

source와 fresh-ZIP acceptance, manifest verification, deterministic double build가 모두 통과한 뒤 packaged deterministic accepted를 선언한다. 실제 Windows 로그 전에는 Windows live를 `PENDING`으로 유지한다.
