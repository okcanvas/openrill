# STEP018C Agent Task Capability Benchmark

## Identity

```text
step=STEP018C_AGENT_TASK_CAPABILITY_BENCHMARK
version=0.18.2-step018c
state_schema=16
parent=STEP018B_SKILL_OPERATIONS_AND_STRUCTURED_TOOL_DISCOVERY
```

## Product objective

Measure whether the accepted Agent capabilities complete small real workflows repeatedly under fixed local conditions. This STEP adds no speculative Connector, channel or marketplace capability.

## Product surface

```text
benchmarks/agent-tasks/index.json
benchmarks/agent-tasks/taxonomy.json
benchmarks/agent-tasks/scenarios/*.json
packages/agent-benchmark
scripts/run-agent-task-benchmark.mjs
```

The `agent-core` profile owns ten primary semantic coverage identifiers:

1. durable memory preference recall;
2. secret no-echo and artifact redaction;
3. safe read-backed Tool followthrough;
4. approval denial without unauthorized execution;
5. proof-backed pending/blocked/done status;
6. share-safe diagnostic artifacts;
7. no completion claim before Tool evidence;
8. retryable model failure recovery;
9. structured hidden Tool discovery and call;
10. delegated Tool scope preservation.

## Evaluation contract

Each scenario declares:

- one primary coverage owner;
- optional secondary coverage;
- objective and deterministic success criteria;
- execution risk;
- duration, turn, model-call, Tool-call and token budgets;
- default repeat count.

The runner records per-attempt assertions, usage, elapsed time, failure class and SHA-256 evidence digests. Suite reliability is `passed attempts / total attempts`.

Failure classes are exact and local:

```text
ASSERTION
BUDGET
TIMEOUT
RUNTIME
```

There is no LLM judge and no model quality ranking claim in STEP018C.

## Runtime boundary

Scenarios use actual OpenRill Product services:

```text
SQLite State
ConversationService
Agent Kernel
MemoryService
ApprovalService
ToolRegistry
Structured Tool Discovery
scripted local ModelAdapter
```

All filesystem and State data is temporary. The benchmark must not access a real account, credential store, Connector, Browser profile or paid model.

## Outputs

```text
.artifacts/benchmarks/STEP018C_AGENT_CORE/result.json
.artifacts/benchmarks/STEP018C_AGENT_CORE/report.md
```

The JSON artifact is machine-readable. Markdown is a bounded operator summary. Both must be share-safe.

## Validation

```cmd
pnpm benchmark:agent
pnpm acceptance:step018c
pnpm acceptance:step018c:live
```

Windows live uses actual Windows Node, SQLite, Agent Kernel and Product services with two deterministic repetitions. It does not use an external model or Browser.

## Explicit non-goals

- generic model leaderboard;
- OpenClaw-compatible QA transport;
- LLM-as-judge scoring;
- real email, chat, calendar or Mattermost accounts;
- Connector implementation without a real system contract;
- Browser live;
- Plugin marketplace;
- benchmark-driven Product tuning before a stable baseline result exists.
