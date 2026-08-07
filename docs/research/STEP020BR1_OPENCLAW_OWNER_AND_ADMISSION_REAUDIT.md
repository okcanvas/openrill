# STEP020BR1 OpenClaw Owner and Admission Re-audit

Source inputs: `openclaw-main.zip` version `2026.7.2` SHA-256 `1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82` and accepted STEP020B ZIP SHA-256 `e24cebe0b8fbb966dc942c0f5df0509b21e4e0a5d583ed6f807f0128c5894751`.

OpenClaw `runtime-taskflow.ts`, `task-flow-owner-access.ts`, and `task-executor.ts` prove two invariants missing from STEP020B: managed Flow access is bound to an owner key, and `cancelRequestedAt` closes new child Task admission. OpenRill maps the owner key to the owning Conversation identity. The correction does not add a bound controller runtime or autonomous executor.

Schema 20 adds `task_flows.owner_key`. Existing schema 19 Flow rows with links from exactly one Conversation are backfilled to that Conversation. Mixed-owner and unlinked rows receive an isolated `legacy:<flowId>` key, preserving data without permitting new Conversation-owned admission.
