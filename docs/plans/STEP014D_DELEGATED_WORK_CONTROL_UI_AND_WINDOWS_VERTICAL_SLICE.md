# STEP014D — Delegated-work Control UI and Windows vertical slice

## Identity

```text
STEP014D_DELEGATED_WORK_CONTROL_UI_AND_WINDOWS_VERTICAL_SLICE
version=0.14.3-step014d
schema=14
baseline=STEP013CR2
retained_features=STEP014A+STEP014B+STEP014C
```

## Goal

Make the durable delegated-work graph observable and operator-controllable without exposing child task text, transcripts, reasoning, Tool payloads, or event payloads. Prove the complete parent → parallel children → nested grandchild → parent resume flow through a real external model, Local Protocol, served Control UI, and real Chromium.

## Public Protocol surface

```text
delegation.list
delegation.get
delegation.cancel
```

The operations use small closed schemas. `list` is bounded to 200 rows and accepts exactly one optional graph anchor (`rootRunId` or `parentRunId`). `get` and `cancel` accept only `delegationId`.

## Public projection

Allowed fields:
- relation IDs, depth, status, expected output and scopes;
- deadline and bounded budget/usage counters;
- bounded terminal summary, Artifact references and typed error;
- wait state and event metadata (`sequence`, `eventType`, `emittedAt`) capped at 100.

Forbidden fields:
- child task or task hash;
- child Conversation transcript;
- reasoning or model/provider payload;
- Tool input/output payload;
- delegation event payload.

## Operator cancellation

`delegation.cancel` reuses STEP014C's deepest-first subtree cleanup and terminalization path. Replay of a terminal delegation is idempotent and does not duplicate events, budget release, or usage charge.

## Control UI

The `delegations` route renders a parent-child preorder tree using `parentRunId`/`childRunId`, not creation-time sorting. It shows bounded status, usage, budget, scope, summary, Artifacts and event metadata. Active nodes expose one `Cancel subtree` action.

## Windows external-model vertical slice

Required environment:

```text
OPENAI_API_KEY
OPENRILL_STEP014D_MODEL
optional OPENRILL_STEP014D_ENDPOINT
optional OPENRILL_CHROMIUM_EXECUTABLE
```

The fixture does not guess a model. It launches Host with the explicit model, creates two direct children in parallel, requires one nested grandchild, waits for all terminal results, verifies the same parent Run completes, queries all three Protocol operations, opens the served Control UI in real Chromium, renders the tree and bounded detail, closes Chromium, and verifies zero orphan.

## Exclusions

```text
detached delegation
distributed child workers
raw transcript/reasoning inspection
unbounded event history
child task editing
schema migration
new Agent Tools
```
