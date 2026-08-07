# OpenClaw Goal and Task-Flow Code Audit

## Answer-key identity

```text
archive=openclaw-main.zip
archive_sha256=1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82
package_version=2026.7.2
license=MIT
commit_sha=NOT_PRESENT_IN_ARCHIVE
```

No commit SHA is claimed because the retained archive contains no `.git` metadata. OpenClaw remains an audited design answer key and is not imported as an OpenRill Product dependency.

## Inspected source

| Path | SHA-256 | Observed contract |
|---|---|---|
| `docs/tools/goal.md` | `cd24d3c8930de8a1effce1cc8050b0aab5961ea06e9ba9ad55f0f0f63e7f8081` | one durable session goal, explicit user controls, active-context continuation |
| `src/config/sessions/goals.ts` | `e5045101ced54ab129cfc6d23fccf4d058761850e220085609897bf312052726` | persisted goal state and session-scoped lifecycle |
| `src/agents/tools/goal-tools.ts` | `acc9cc4ac52c40eb7c223f8a7dce9d446cea55f8433b8e777c8560266c87be56` | Agent-operable goal tools |
| `src/auto-reply/reply/commands-goal.ts` | `c363fd5968248fbf6dfa0d1f8ca571e297427f6b0d4d77164c49ff87bbb609f0` | explicit pause/resume/cancel/status controls |
| `docs/automation/tasks.md` | `f9cb94b4c35cb4b8b3c8b98d9af82b7629f723b319b9e832f816a561153a8bfb` | durable task-state vocabulary and long-running work guidance |
| `docs/automation/taskflow.md` | `138b1e89c71a233468acfbd0489cb5b8662539c959498cef881ae45eb13ada81` | revision/conflict-aware task-flow direction |
| `qa/scenarios/goals/goal-context-next-turn.yaml` | source-audited | active goal appears on a later turn |
| `qa/scenarios/goals/goal-context-survives-compaction.yaml` | source-audited | continuation state survives context reduction |
| `qa/scenarios/goals/goal-followthrough-live.yaml` | source-audited | Agent advances work rather than merely restating it |

## Adopted principles

1. A Conversation owns at most one open durable goal.
2. The active goal is injected into future root-Agent turns.
3. The Agent must advance the first unfinished step rather than only repeat a plan.
4. Pause, resume and cancel are explicit control actions.
5. Completion requires durable evidence, not an optimistic final sentence.
6. Repeated blockers become durable state instead of endless retries.
7. Long-running state must survive Host and SQLite restart.

## OpenRill-owned strengthening

OpenRill does not copy OpenClaw data structures. It adds its own constraints:

- State schema 17 with exact Workspace, Conversation, Run and Attempt provenance;
- ordered plan steps with per-goal and per-step CAS revisions;
- no later step may advance before every earlier step is completed;
- a goal cannot complete until every plan step is completed;
- the same normalized blocker must be reported three consecutive times before `BLOCKED`;
- delegated child Runs do not inherit the parent Conversation goal context;
- all mutations use the existing ToolRegistry and do not widen approval or Tool scope.

## Explicit deferrals

STEP019A does not implement OpenClaw Task Flow as a detached workflow controller. It does not add a background task executor, schedules, network distribution, Plugin installation, UI, external model acceptance, Browser live acceptance, Mattermost, or Connector. Those require separate executable Product contracts and measured demand.
