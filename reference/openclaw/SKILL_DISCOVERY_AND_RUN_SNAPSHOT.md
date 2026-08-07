# OpenClaw Skill Discovery and Run Snapshot Evidence

## 검증 원본

별도 추출한 `openclaw-main.zip` SHA-256:

```text
1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82
```

전체 evidence는 `120/120 VERIFIED`다.

## 관찰

- `[OC-SKILL-001]` Skill metadata와 source/prompt version을 별도 계약으로 둔다.
- `[OC-SKILL-002]` 검증된 metadata를 prompt catalog로 투영한다.
- `[OC-SKILL-003]` local file을 root boundary helper로 읽는다.
- `[OC-SKILL-004]` bundled/managed/workspace 계층을 통합한다.
- `[OC-SKILL-005]` Run snapshot prompt가 있으면 새 prompt보다 우선한다.

## OpenRill 채택

- metadata-only discovery
- root containment와 symlink escape denial
- explicit source precedence
- immutable per-Run snapshot reuse
- invalid Skill isolation과 durable diagnostics

## OpenRill 변경

- `skill.yaml + instructions.md` 전용 strict format
- content bytes는 Product-owned private state directory에 복사
- schema-7 source/context/snapshot ledger
- activation hint deterministic selection
- required Tool registry validation

## 제외

OpenClaw code 복사, package dependency, plugin loader, remote node Skill, workshop/registry, OpenClaw `SKILL.md` compatibility는 없다.
