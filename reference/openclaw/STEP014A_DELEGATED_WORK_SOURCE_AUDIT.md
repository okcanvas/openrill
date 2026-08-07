# OpenClaw delegated-work source audit for STEP014A

Source archive SHA-256:

```text
openclaw-main.zip
1a4fbe7e05ebd37db79a335749067b715eca900db1071e6d4af1cd5604604e82
```

Inspected files:

| File | Lines | SHA-256 | Observed responsibility |
|---|---:|---|---|
| `src/agents/subagent-spawn-contract.ts` | 85 | `9fa23d8651e2991bf224676a7ceda7cc960ad3e1ddced721670040b8b48b90df` | task/context/tool contract |
| `src/agents/subagent-spawn-plan.ts` | 135 | `c81a237e381e7d83cc4cd576c03f8ae323bf051d29d741941869a1c762b6e258` | spawn planning and policy |
| `src/agents/subagent-run-timeout.ts` | 65 | `bb03b8757b41f5db2bf4618299c2af775c588bca878f71385c620e6bc87a0c72` | child timeout |
| `src/agents/subagent-registry.store.sqlite.ts` | 455 | `30126778789afb1b6923a83b0df364f180e9dc64224c6059b459ba758d7b9918` | SQLite persistence |
| `src/agents/subagent-registry-sweep-kill.ts` | 306 | `2dda96f59b15bbcc2716213cfa7000afad153e45b388994e564a565689b26040` | cleanup and cancellation |
| `src/agents/tools/sessions-spawn-tool.ts` | 583 | `c51a30ccd51b3bc0b2de522eb46ac019f4f1de6f960b95fdde77090e5d2e5b80` | public spawn surface |
| `src/agents/subagent-spawn.depth-limits.test.ts` | 242 | `7db0ab1b3e63b410c05c2dda65f640e42aa294a4351f5fea68ce8249e6d0ea31` | depth and child limits |
| `src/agents/subagent-registry.persistence.resume.test.ts` | 181 | `39c8e0047e7cb83762d74f3958d7edd5b1660022a2732e70195227f12ba95985` | restart persistence/resume |

Observed architecture is not a single Tool wrapper. It includes contract planning, timeout, SQLite registry, resume, cancellation/reconciliation, Tool allowlisting, depth/child limits, and completion delivery.

OpenRill differences:

- OpenRill uses durable Conversation/Agent Run/attempt/event ownership rather than copying OpenClaw session identities.
- STEP014A adds no public spawn Tool.
- OpenRill stores the task in a child Conversation and only a digest in the delegation ledger.
- `WAITING_DELEGATION` is a separate projection to preserve historical `agent_runs` migration ownership.
- OpenRill budget includes cumulative token and wall-clock limits before delegated execution is exposed.
- No OpenClaw source is imported or copied.
