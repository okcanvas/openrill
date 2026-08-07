# OpenClaw Skill Operations and Tool Search Code Audit

## Source baseline

This audit uses the retained `openclaw-main.zip` identified in `reference/openclaw/OPENCLAW_SOURCE_BASELINE.md`:

```text
archive_sha256=1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82
package_version=2026.7.2
commit_sha=NOT_PRESENT_IN_ARCHIVE
```

No statement in this document invents a Git commit. OpenClaw facts below are derived from exact paths in that archive. OpenRill choices are labelled separately. OpenRill imports no OpenClaw Product dependency.

## OpenClaw source paths inspected

### Skill operations and eligibility

- `src/cli/skills-cli.ts`
- `src/cli/skills-cli.format.ts`
- `src/skills/discovery/status.ts`
- `src/skills/config/mutations.ts`
- `src/skills/loading/config.ts`
- `src/skills/loading/workspace.ts`
- `src/skills/discovery/agent-filter.ts`
- `src/skills/discovery/skill-index.ts`

### Structured Tool Search

- `src/agents/tool-search-types.ts`
- `src/agents/tool-catalog.ts`
- `src/agents/tool-search.ts`
- `src/agents/tool-search-directory.ts`
- `src/agents/tool-search-ranking.ts`
- `src/agents/tool-search-runtime.ts`
- `src/agents/tool-search-config.ts`

## Source-derived OpenClaw contracts

1. **Skill status is an operational product surface.** The CLI resolves a concrete Agent/workspace, prefers Gateway status when available, and falls back to local status construction. Status records distinguish source, disabled state, eligibility, platform incompatibility, missing requirements and install choices.
2. **Eligibility is configuration- and runtime-sensitive.** `status.ts` evaluates platform, binaries, environment, config checks, allowlists and Agent filters rather than treating a discovered manifest as automatically runnable.
3. **Skill configuration changes are explicit mutations.** `config/mutations.ts` separates configuration mutation from discovery and status rendering.
4. **Large Tool catalogs are not exposed wholesale.** Tool Search has distinct catalog, search, describe and call contracts. Compact catalog entries omit full schemas until description is requested.
5. **Search is bounded and ranked.** `tool-search-config.ts` bounds default and maximum result counts. `tool-search-ranking.ts` tokenizes and ranks capability text.
6. **Parameter metadata matters for discovery.** `tool-search.ts` includes trusted first-party parameter names/descriptions in searchable text because task vocabulary can occur only in argument schemas.
7. **Unknown Tool recovery is typed and actionable.** Search code produces exact-ID/name recovery instructions and suggestions instead of silently guessing.
8. **Visibility and execution remain separate.** Catalog visibility does not itself authorize execution; the runtime resolves and calls a concrete catalog entry.

## OpenRill STEP018B adoption

OpenRill adopts the following proven principles while preserving its own approval, workspace, timeout, cancellation and durable delegation boundaries:

- `openrill skill list/show/check/enable/disable` as a real operational surface;
- source, enabled state, required Tool list, diagnostics and shadow evidence;
- Skill eligibility against the actual configured Tool set, including Browser enablement;
- bounded structured controls `tool.search`, `tool.describe`, `tool.call`;
- a compact direct Tool schema set with active-Skill-required Tools promoted directly;
- hidden Tool execution through the existing `ToolRegistry`, never a parallel executor;
- exact delegated `allowedToolNames` enforcement through `tool.call`;
- no recursive Tool Search control calls;
- typed missing and out-of-scope failures.

## Deliberately deferred OpenClaw surfaces

STEP018B does **not** claim:

- ClawHub installation/update/trust verification;
- arbitrary Plugin loading or remote marketplace execution;
- Tool Search code-mode sandbox;
- MCP/client Tool catalogs;
- persistent Agent-specific Skill marketplaces;
- remote Skill proposal/workshop workflows.

Those surfaces require real distribution, trust and extension contracts. They are not inferred from names alone.
