# OpenRill Skill Contract

## 목적

Skill은 모델 provider, Tool 구현, Workspace filesystem과 분리된 Product-owned instruction package다. Discovery catalog에는 metadata만 올리고 instructions/resources는 Run 선택 시점에만 읽는다.

## 참조 관찰

OpenClaw는 Skill metadata와 prompt projection, root-contained local loader, source precedence, Run snapshot prompt 재사용을 분리한다: `[OC-SKILL-001]`부터 `[OC-SKILL-005]`. OpenRill은 코드를 복사하거나 dependency로 사용하지 않는다.

## Directory

```text
my-skill/
  skill.yaml
  instructions.md
  resources/
    guide.md
```

OpenClaw `SKILL.md`, plugin manifest, executable Skill package 호환 parser는 제공하지 않는다.

## skill.yaml

정확한 top-level key:

```yaml
id: workspace-review
version: 1.0.0
description: Review a configured workspace.
activation:
  - review workspace
instructions: instructions.md
tools:
  - workspace.list
  - workspace.read
resources:
  - resources/guide.md
compatibility:
  minOpenRill: 0.10.0-step010
  maxOpenRillExclusive: 1.0.0
```

- `id`: lowercase kebab-case, 최대 64자
- `version`: `major.minor.patch`와 선택 prerelease
- `description`: 비어 있지 않은 text
- `activation`: case-insensitive deterministic substring hints
- `instructions`: Skill directory 내부 UTF-8 file
- `tools`: 현재 Host registry에 존재하는 Tool 이름
- `resources`: Skill directory 내부 UTF-8 regular files
- `compatibility`: `minOpenRill`, `maxOpenRillExclusive`만 허용

Unknown, duplicate, ambiguous YAML field는 실패한다. tabs, anchors, aliases, tags, flow collection, multiline scalar는 V1에서 지원하지 않는다.

## Source와 precedence

```text
BUNDLED       precedence 10
MANAGED_USER  precedence 20
WORKSPACE     precedence 30
```

같은 `skillId`는 높은 precedence가 선택되고 나머지는 `SKILL_SHADOWED` diagnostic으로 남는다. 같은 precedence에서는 config root ordinal이 빠른 source가 우선한다.

## Validation과 격리

invalid manifest, incompatible version, missing file, path/symlink escape, binary content, unavailable required Tool은 해당 Skill만 격리한다. 다른 valid Skill discovery는 계속된다.

`skills.enabled`가 비어 있으면 valid Skill 전체가 activation 대상이다. 값이 있으면 정확한 Skill ID allowlist다.

## Immutable Run snapshot

Run 최초 resolution에서 선택된 Skill의 manifest, instructions, resources를 Product-owned private directory로 복사하고 SHA-256 metadata를 schema-7 ledger에 기록한다.

```text
skill_sources
skill_validation_diagnostics
skill_run_contexts
skill_snapshots
```

같은 Run은 `skill_run_contexts`와 snapshot file만 재사용한다. 원본 변경·삭제는 현재 Run에 영향을 주지 않고 다음 Run discovery부터 반영된다. load 시 모든 snapshot file의 byte count와 SHA-256을 검증한다.

## 제외

- remote registry와 marketplace
- executable Skill code
- dependency installation
- model-selected arbitrary Skill discovery
- user ZIP upload
- mutable in-place Run snapshot
