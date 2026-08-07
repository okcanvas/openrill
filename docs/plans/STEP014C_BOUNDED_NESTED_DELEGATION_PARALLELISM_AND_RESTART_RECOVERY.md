# STEP014C — Bounded nested delegation, parallelism, and restart recovery

```text
step=STEP014C_BOUNDED_NESTED_DELEGATION_PARALLELISM_AND_RESTART_RECOVERY
version=0.14.2-step014c
schema=14
baseline=STEP013CR2_SQLITE_NULL_PROTOTYPE_LIVE_ASSERTION_ALIGNMENT
retained=STEP014A,STEP014B
```

## Goal

Extend the durable STEP014A graph and STEP014B `agent.spawn`/`agent.wait` execution model from one depth-1 child to bounded depth-2 nested work and parallel child reservations without widening authority or losing terminal results across Host restart.

## Included

- migration 014 and durable reservation/release rows;
- cumulative own plus descendant usage accounting;
- maximum depth 2 by the default root envelope, bounded by the durable parent envelope;
- multiple non-blocking children within `maxActiveChildren` and `maxTotalChildren`;
- actual-use charging and release of unused reserved capacity;
- deepest-first cancellation of descendant process, Browser, approval and Run resources;
- child deadline sweep and typed `DELEGATION_TIMEOUT` terminal delivery;
- startup reconciliation of terminal children whose parent result was not delivered;
- startup scheduling of durable child Runs that are runnable and not waiting on descendants;
- exactly-once terminal delivery retained from schema 13.

## Public surface

The public Tool surface remains exactly:

```text
agent.spawn
agent.wait
```

`agent.spawn` gains bounded optional fields:

```text
maxNestedDepth
maxActiveChildren
maxTotalChildren
```

Nested delegation Tool access is derived from `maxNestedDepth` and inherited durable scope. Callers may not inject `agent.spawn` or `agent.wait` through `toolNames`.

## Excluded

```text
depth greater than durable envelope
unbounded fan-out
detached child
remote/distributed worker
delegation protocol list/get/cancel
Control UI child tree
Windows external-model delegated-work acceptance
```

Those observability and live product surfaces remain STEP014D.
