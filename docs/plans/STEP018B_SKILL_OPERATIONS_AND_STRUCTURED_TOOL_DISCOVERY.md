# STEP018B Skill Operations and Structured Tool Discovery

## Product goal

Make existing OpenRill Skills operable by a user and make a growing Tool catalog usable by the Agent without sending every schema on every model turn.

## Scope

- Skill list, show, check, enable and disable CLI commands.
- Source, eligibility, required-Tool, diagnostic and shadow evidence.
- Config-sensitive Tool eligibility.
- Structured `tool.search`, `tool.describe`, `tool.call` controls.
- Compact root-Agent schema visibility.
- Active Skill required Tools directly visible.
- Existing approval, workspace, timeout, cancellation and delegation scope preserved.
- OpenClaw source audit retained as the answer key.

## Non-scope

- Plugin runtime or remote plugin installation.
- ClawHub/marketplace compatibility.
- Browser live acceptance.
- External model acceptance.
- Mattermost or Connector implementation.

## Acceptance outcomes

1. A user can inspect and atomically enable/disable a discovered Skill.
2. Skill check fails closed when a required Tool is unavailable in the actual profile.
3. Browser-required Skills are ineligible when Browser Runtime is disabled.
4. A large catalog exposes core and Skill-preferred schemas plus three discovery controls.
5. The Agent can search, describe and execute a hidden Tool.
6. `tool.call` cannot bypass a delegated Run's durable Tool allowlist.
7. Active Skill Tool schemas are directly visible; unrelated schemas remain hidden.
8. No Product execution path bypasses `ToolRegistry`.
