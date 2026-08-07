# OpenRill

**A local-first durable AI agent runtime for long-running, restart-safe, tool-using workflows.**

OpenRill is an experimental agent runtime focused on one problem:

> An agent should be able to execute real work over time without losing execution identity, orchestration state, or recovery semantics when a process stops, a host restarts, a tool waits for approval, or an external system becomes temporarily unavailable.

Instead of treating an agent run as a single in-memory request, OpenRill models conversations, goals, plans, runs, tasks, task flows, tool execution, connectors, and maintenance as explicit durable runtime concepts.

---

## Why OpenRill?

Many agent implementations work well while a single process stays alive, but long-running work introduces harder problems:

* What happens when the host restarts?
* How is a running task resumed without creating duplicates?
* Who owns cancellation?
* How do multiple tasks form one workflow?
* How does a completed child task wake its controller?
* How are retries and blockers represented durably?
* How do external messages enter the runtime without being acknowledged too early?
* How can old workflow state be physically removed without deleting something still referenced?

OpenRill approaches these as runtime and state-modeling problems rather than prompt-engineering problems.

---

## Core Runtime Model

OpenRill deliberately keeps several concepts separate.

```text
Conversation
    │
    ├── Goal
    │    └── revisioned Plan
    │          └── Goal execution projection
    │
    ├── Task Flow
    │    └── Task
    │          └── Run
    │               └── Attempt
    │
    └── Messages / Events / Tool Results
```

### Goal

A durable objective owned by a Conversation.

### Plan

A revisioned, ordered proposal for achieving a Goal.

A Plan describes **intent**. It is not execution state.

### Run

The authoritative execution lifecycle.

### Attempt

One execution attempt of a Run, with its own provenance.

### Task

A durable one-to-one Run-linked activity ledger.

A Task records execution facts and delegates cancellation to its owning Run. It is **not** a scheduler.

### Task Flow

A durable controller-owned orchestration record over multiple Tasks.

A Task Flow owns orchestration state such as:

* revision
* current step
* wait state
* block state
* cancellation intent

It is not itself an autonomous Plan executor.

The runtime maintains the following separation:

```text
Goal / Plan intent
    !=
Step execution projection
    !=
Task execution fact
    !=
Run execution authority
```

This boundary is one of the central design rules of OpenRill.

---

## What Is Implemented

OpenRill currently contains working foundations for:

* durable Conversations and message/event history
* SQLite-backed runtime state
* Run and Attempt lifecycle management
* model adapter boundaries
* OpenAI Responses model adapter
* workspace-scoped execution
* file tools
* process tools
* tool discovery and runtime
* Tool Approval and resume
* Skills discovery and profile enablement
* durable agent memory
* browser runtime foundations
* Playwright browser integration
* Host and Docker process backends
* Automation persistence and scheduling
* durable Goal and revisioned Plan state
* Goal/Plan → Task Flow execution
* durable Task lifecycle
* controller-owned Task Flow orchestration
* atomic child Task admission
* retry and blocker handling
* durable completion delivery
* controller wake-up after child completion
* Host restart recovery
* cancellation propagation
* stale/lost runtime reconciliation
* local Extension runtime
* durable Connector ingress and delivery ledgers
* Mattermost REST/WebSocket connector implementation
* periodic retention scheduling
* durable maintenance leases
* persisted maintenance sweep cursors
* protected physical pruning
* retention tombstones

---

## Durable Execution

OpenRill is designed so execution identity survives process boundaries.

For managed workflows, state is not reconstructed only from prompts or transient memory. Runtime ownership is recorded explicitly.

Examples include:

```text
Goal
  → Plan revision
  → active Step
  → controller-owned Task Flow
  → child Task
  → Run
  → Attempt
```

When a child Task completes, completion can be delivered durably back to its owning controller rather than relying on an in-memory callback.

When the Host restarts, recovery logic uses persisted state to decide what may safely continue, reconcile, block, cancel, or remain untouched.

---

## Tool Execution

The repository contains tool/runtime foundations for capabilities including:

```text
@openrill/tool-runtime
@openrill/tool-discovery
@openrill/tools-files
@openrill/tools-process
@openrill/tools-memory
@openrill/tools-goals
@openrill/tools-delegation
@openrill/approval
```

Tool approval is modeled as runtime state so execution can wait and resume without pretending the original process remained alive.

---

## Skills

Skills are treated separately from Tools.

```text
Skill
  → describes capability and requirements

Tool
  → performs an executable operation
```

The repository contains Skill discovery, eligibility checks, profile allowlisting, and built-in Skill infrastructure.

CLI operations include:

```text
openrill skill list
openrill skill show <id>
openrill skill check
openrill skill enable <id>
openrill skill disable <id>
```

---

## Connectors

OpenRill separates external transport concerns from Conversation, Run, Task, Task Flow, Goal, Plan, and State ownership.

The current repository contains a Mattermost connector package:

```text
connectors/mattermost
```

Its transport boundary includes:

* REST authentication
* WebSocket event ingestion
* direct-message routing
* channel mention routing
* thread routing
* ingress persistence
* Conversation/Run adoption
* terminal assistant delivery
* provider receipt persistence
* restart-safe duplicate protection

A local Mattermost Docker testbed is included under:

```text
testbeds/mattermost
```

The real Mattermost integration remains classified as **LIVE_PENDING** until its required live acceptance gate is completed.

It is not presented as production-certified integration.

---

## Maintenance and Retention

The current source candidate adds physical retention for durable runtime history.

Retention is intentionally separate from reconciliation.

A record becoming old enough for retention does **not** automatically mean that it is safe to delete.

Before physical deletion, OpenRill rechecks protections such as active or unresolved references.

The maintenance path includes:

```text
periodic Host-owned sweep
    │
    ├── durable lease
    ├── persisted sweep cursor
    ├── retention candidate selection
    ├── protection recheck
    ├── tombstone creation
    └── physical prune
```

Ambiguous Connector delivery history is not automatically pruned.

The current state schema is:

```text
26
```

---

## Repository Structure

```text
openrill/
├── apps/
│   ├── agent-cli/
│   ├── agent-web/
│   └── desktop/
│
├── services/
│   └── agent-host/
│
├── packages/
│   ├── agent-kernel/
│   ├── approval/
│   ├── automation/
│   ├── browser-runtime/
│   ├── conversations/
│   ├── extension-sdk/
│   ├── goal-executor/
│   ├── goals/
│   ├── memory/
│   ├── model-adapter/
│   ├── model-openai-responses/
│   ├── protocol/
│   ├── sandbox/
│   ├── state/
│   ├── task-flows/
│   ├── tasks/
│   ├── tool-runtime/
│   ├── tools-*/
│   └── workspace/
│
├── connectors/
│   └── mattermost/
│
├── skills/
│   └── builtin/
│
├── testbeds/
│   └── mattermost/
│
├── tests/
├── scripts/
├── docs/
├── reference/
└── openrill.mjs
```

The workspace currently contains 37 architectural packages.

---

## Requirements

The root package contract currently requires:

```text
Node.js >= 22.16.0 < 23
or
Node.js >= 24.0.0

pnpm >= 11.15.1
```

The repository pins:

```text
pnpm@11.15.1
```

Python is also used by the repository's validation, architecture, manifest, and packaging scripts.

Docker is required only for features that use the Docker execution backend or the Mattermost testbed.

---

## Build

Clone the repository and install the pinned workspace dependencies.

```bash
git clone https://github.com/okcanvas/openrill.git
cd openrill

pnpm install --frozen-lockfile
pnpm build
```

Then inspect the CLI:

```bash
node openrill.mjs help
```

---

## CLI

The current CLI exposes:

```text
openrill setup
openrill doctor
openrill ask

openrill conversation list
openrill conversation show <id>

openrill skill list
openrill skill show <id>
openrill skill check
openrill skill enable <id>
openrill skill disable <id>

openrill start
openrill run
openrill status
openrill stop

openrill config path
openrill config validate
openrill config show
openrill config init
```

Prompt text for `ask` is read from **stdin**, not from a command-line argument.

Secrets are not accepted as normal command-line arguments, and configuration output is designed to remain redacted.

---

## Windows Local Setup

The current setup path includes Windows DPAPI support for local API-key protection.

After building:

```cmd
node openrill.mjs setup --workspace . --endpoint https://api.openai.com/v1 --model <model-id>
```

Then verify the local environment:

```cmd
node openrill.mjs doctor
```

`setup` can securely request the API key interactively.

Automation can use `--api-key-stdin`; API keys are not designed to be stored directly in repository configuration.

---

## Validation

OpenRill development uses explicit acceptance gates rather than treating compilation as sufficient evidence.

Typical repository checks include:

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm test:architecture
pnpm test:exports
pnpm package:verify
```

Individual development steps also have focused acceptance suites.

For the current source candidate:

```bash
pnpm acceptance:step023a
```

The Windows maintenance-retention live gate is:

```bash
pnpm acceptance:step023a:live
```

A candidate is not described as live-accepted until its required live gate actually passes.

---

## Current Development Status

```text
Current source:
  STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE

Version:
  0.25.0-step023a

State schema:
  26

Source/package status:
  LOCAL_SOURCE_ACCEPTED

Windows STEP023A live status:
  PENDING

Mattermost connector:
  PREPARING / LIVE_PENDING

Current accepted Product baseline:
  0.21.3-step021br2

Accepted baseline checks:
  82/82
```

OpenRill is under active development.

The repository contains completed foundations and executable acceptance suites, but the current source candidate should not be interpreted as a production-ready release.

---

## Design Principles

### Durable state before convenience

Important workflow facts should survive process termination.

### Explicit ownership

Run, Task, Task Flow, Goal, Plan, Connector, and maintenance responsibilities should not silently overlap.

### No success by assumption

A scheduled action, network send, or retention deadline is not automatically considered successful.

### Persist before acknowledging external work

External ingress is persisted before the runtime considers it adopted.

### Fail closed on ambiguous delivery

If an external provider may already have accepted a delivery, OpenRill does not blindly replay it.

### Recovery must preserve identity

Restart handling should resume or reconcile existing durable work instead of manufacturing replacement work.

### Retention must not mutate active workflow semantics

Deletion eligibility is rechecked at the State boundary before physical pruning.

### Tests are evidence, not documentation decoration

Live, deterministic, packaging, architecture, and regression gates are kept distinct.

---

## Documentation

The repository intentionally keeps detailed engineering evidence alongside the source.

Start with:

* [`ARCHITECTURE.md`](ARCHITECTURE.md) — architecture and dependency boundaries
* [`PROJECT.md`](PROJECT.md) — detailed project state
* [`ROADMAP.md`](ROADMAP.md) — development progression
* [`GLOSSARY.md`](GLOSSARY.md) — runtime terminology
* [`DECISIONS.md`](DECISIONS.md) — retained architectural decisions
* [`VALIDATION.md`](VALIDATION.md) — validation history and evidence
* [`HANDOFF.md`](HANDOFF.md) — exact continuation state
* [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution guidance
* [`SECURITY.md`](SECURITY.md) — security guidance

Detailed contracts, implementation plans, research audits, and failure-prevention records live under:

```text
docs/
reference/
```

The repository deliberately retains failed acceptance evidence and corrective records so that previously discovered failure modes are not silently reintroduced.

---

## Development Philosophy

OpenRill is developed under a simple rule:

> **Do not infer runtime behavior from names, intentions, or documentation when the code and executable evidence can be inspected.**

Changes are expected to preserve:

* source-grounded decisions
* explicit runtime ownership
* deterministic regression coverage
* failure evidence
* restart behavior
* package integrity
* continuation documentation

---

## Security

Do not commit credentials or local secret files.

The repository ignores local environment and common private-key file families, while keeping example configuration files trackable.

See [`SECURITY.md`](SECURITY.md) for the project security boundary.

---

## License

An OpenRill project license has **not yet been selected**.

Do not infer OpenRill's license from third-party notices or referenced projects.

See [`NOTICE.md`](NOTICE.md) for third-party attribution information.

---

## Project Status

OpenRill is an active experimental runtime project.

It is currently best suited for:

* agent-runtime research
* durable workflow experimentation
* local autonomous-agent infrastructure
* restart/recovery semantics
* tool orchestration
* agent execution-state modeling
* connector durability experiments

APIs, schemas, protocols, and operational contracts may continue to evolve before a stable release.
