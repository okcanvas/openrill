# OR-ISSUE-223 — Tool catalog compaction hid accepted Memory mutation tools

## First observation

STEP018B canonical validation failed in `memory-host-integration-step018a.test.mjs`. The Agent completed both scripted runs, but the first model request no longer exposed `memory.remember`.

## Direct cause

The initial compact direct Tool set retained `memory.search` and `memory.get` but omitted `memory.remember` and `memory.forget`. This regressed the Windows-live-accepted STEP018A explicit memory contract by requiring discovery before the model could perform the primary remember action.

## Classification

```text
owner_dimension=PRODUCT_INTEGRATION_REGRESSION
accepted_parent_capability=STEP018A_MEMORY
state_schema_change=NONE
```

## Correction

All four explicit durable memory tools remain in the bounded core direct Tool set:

```text
memory.remember
memory.search
memory.get
memory.forget
```

Large unrelated Tool schemas still remain hidden behind structured discovery.

## OpenClaw-grounded rationale

The retained OpenClaw source treats memory search/get as first-class memory tools rather than generic catalog-only extensions. OpenRill extends this principle to its explicit mutation contract so the accepted remember/forget user capability is not weakened by catalog optimization.

## Recurrence prevention

Any schema compaction change must run prior accepted capability integration tests and preserve the Tool schemas necessary to initiate those accepted flows.
