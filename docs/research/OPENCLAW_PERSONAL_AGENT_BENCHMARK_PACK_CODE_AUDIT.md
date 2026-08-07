# OpenClaw Personal Agent Benchmark Pack Code Audit

## Audited answer key

```text
archive=openclaw-main.zip
archive_sha256=1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82
package_version=2026.7.2
license=MIT
commit_sha=NOT_PRESENT_IN_ARCHIVE
```

The archive has no `.git` metadata. This audit therefore names exact archive paths and file hashes instead of inventing a commit identity.

## Exact source inspected

| OpenClaw path | SHA-256 | Source-grounded observation |
|---|---|---|
| `docs/concepts/personal-agent-benchmark-pack.md` | `832e5ab0ba9052f161bcef35a5445dc32efc46e796574397e154be70ea608341` | The pack is a small repo-backed local QA catalog, not a generic model benchmark. It reuses the existing QA stack and mock provider lane. |
| `qa/scenarios.md` | `c5308c7b8954146ff093d984902b4e4fee51b8e755c2186fe84329b06020a67a` | Scenario definitions live in the repository catalog. |
| `extensions/qa-lab/src/scenario.ts` | `bb79f06d3f69f5c33c94612cf3ac9e807e4f0ff425ec4f3f203702e996beb8a8` | A scenario is an ordered set of named steps; execution stops at the first failed step and retains details. |
| `extensions/qa-lab/src/self-check-scenario.ts` | `9dfab2da98053c5a80f99eaaeec23cd7ef1c2bef587015fa47bebf882504de2e` | Existing transport/runtime actions are reused for proof-backed checks instead of introducing a second execution engine. |

Ten source scenarios were inspected under `qa/scenarios/personal/*.yaml`:

- `qa/scenarios/personal/approval-denial-stop.yaml`
- `qa/scenarios/personal/channel-thread-reply.yaml`
- `qa/scenarios/personal/failure-recovery.yaml`
- `qa/scenarios/personal/memory-preference-recall.yaml`
- `qa/scenarios/personal/no-fake-progress.yaml`
- `qa/scenarios/personal/redaction-no-secret-leak.yaml`
- `qa/scenarios/personal/reminder-roundtrip.yaml`
- `qa/scenarios/personal/share-safe-diagnostics-artifact.yaml`
- `qa/scenarios/personal/task-followthrough-status.yaml`
- `qa/scenarios/personal/tool-safety-followthrough.yaml`

The OpenClaw documentation explicitly requires fake users, fake preferences, fake secrets, temporary QA workspaces, local providers, one focused behavior per case, and no new runner, plugin, dependency, live transport, or model judge until the catalog justifies it.

## Adopted OpenRill principles

STEP018C adopts these source-grounded principles:

1. **Repository ownership** — scenario definitions and semantic coverage are versioned with Product source.
2. **Existing runtime reuse** — scenarios execute through OpenRill Agent Kernel, State, Memory, Approval and ToolRegistry boundaries.
3. **Local deterministic lane** — scripted model adapters and temporary workspaces are the promotion source; no paid model or live account is required.
4. **Single-behavior cases** — each primary coverage identifier has exactly one owner.
5. **Proof-backed assertions** — deterministic assertions, budgets and evidence digests replace a subjective LLM judge.
6. **Share-safe artifacts** — reports preserve status and evidence hashes while removing fake credentials and raw sensitive values.
7. **Repeated reliability** — the same scenario can be repeated under the same budget to expose nondeterminism.

## OpenRill-specific decisions

OpenRill does not copy the OpenClaw QA transport or YAML execution engine. It owns a typed JSON catalog and a small TypeScript runner because OpenRill already has direct access to its embedded Agent Kernel and Product services.

The initial `agent-core` profile substitutes two OpenRill-owned capability cases for OpenClaw channel/reminder cases:

- structured Tool discovery through `tool.search/describe/call`;
- delegated Tool scope preservation.

This is deliberate: STEP018C measures only capabilities already owned by the accepted OpenRill baseline. Mattermost, Connector, real accounts, Browser live, external model judging and Plugin marketplace evaluation remain deferred.

## Dependency boundary

OpenRill imports no OpenClaw Product dependency. The uploaded archive is a retained design and test answer key only. OpenRill keeps its own State schema, Workspace identity, Approval, Memory, ToolRegistry, delegation, cancellation, package and acceptance boundaries.
