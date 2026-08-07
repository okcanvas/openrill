# OpenClaw Source Baseline

## Retained answer key

```text
archive=openclaw-main.zip
archive_sha256=1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82
package_version=2026.7.2
license=MIT
commit_sha=NOT_PRESENT_IN_ARCHIVE
```

The uploaded archive contains no `.git` metadata. OpenRill therefore does not invent a commit SHA. Every comparison must cite an exact path in this retained archive and distinguish source-derived OpenClaw behavior from an OpenRill design choice.

## Memory source paths inspected for STEP018A

- `docs/concepts/memory.md`
- `docs/reference/memory-config.md`
- `extensions/memory-core/src/tools.ts`
- `extensions/memory-core/src/tools.shared.ts`
- `extensions/memory-core/src/prompt-section.ts`
- `extensions/memory-core/src/tools.test.ts`
- `extensions/memory-core/src/tools.citations.test.ts`
- `extensions/memory-core/src/memory/manager-search.test.ts`
- `extensions/memory-core/src/memory/manager.fts-only-reindex.test.ts`
- `extensions/memory-core/src/memory/memory-path-provenance.test.ts`
- `extensions/memory-core/src/session-search-visibility.cross-agent.test.ts`

## Skill and Tool Search paths inspected for STEP018B

- `src/cli/skills-cli.ts`
- `src/cli/skills-cli.format.ts`
- `src/skills/discovery/status.ts`
- `src/skills/config/mutations.ts`
- `src/skills/loading/config.ts`
- `src/skills/loading/workspace.ts`
- `src/skills/discovery/agent-filter.ts`
- `src/skills/discovery/skill-index.ts`
- `src/agents/tool-search-types.ts`
- `src/agents/tool-catalog.ts`
- `src/agents/tool-search.ts`
- `src/agents/tool-search-directory.ts`
- `src/agents/tool-search-ranking.ts`
- `src/agents/tool-search-runtime.ts`
- `src/agents/tool-search-config.ts`

The OpenClaw tree is reference source only. OpenRill imports no OpenClaw Product dependency and retains its own State, approval, workspace, confinement, cancellation and package boundaries.

## Personal Agent benchmark paths inspected for STEP018C

- `docs/concepts/personal-agent-benchmark-pack.md`
- `qa/scenarios.md`
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
- `extensions/qa-lab/src/scenario.ts`
- `extensions/qa-lab/src/self-check-scenario.ts`

STEP018C follows the source-owned small-scenario, local-provider, fake-data, single-behavior and no-model-judge principles while retaining OpenRill-owned execution and evidence boundaries.
