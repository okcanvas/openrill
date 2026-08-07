# STEP014A local deterministic validation

## Candidate

```text
STEP014A_DURABLE_DELEGATION_GRAPH_BUDGET_ENVELOPE_AND_WAIT_STATE_FOUNDATION
version=0.14.0-step014a
schema=12
baseline=STEP013CR2
```

Official accepted baseline remains:

```text
STEP013CR2_SQLITE_NULL_PROTOTYPE_LIVE_ASSERTION_ALIGNMENT
checks=163/163
sha256=c4314c2c9c877f503fc6bb84e04f5abc698f22c8e9104c826b7f0e2d328904fc
```

## Source aggregate

```text
STEP014A_DURABLE_DELEGATION_GRAPH_BUDGET_ENVELOPE_AND_WAIT_STATE_FOUNDATION checks=102/102 state=PASSED schema=12 baseline=STEP013CR2 delegation=FOUNDATION budget=TOTAL_TOKEN_TIME_DEPTH_CHILD wait=WAITING_DELEGATION scope=MONOTONIC transitions=VALIDATED tools=UNCHANGED_15 protocol=UNCHANGED reporter=TAP
```

Validated within the aggregate:

```text
focused delegation foundation=15/15
focused delegation boundaries=10/10
focused total=25/25
canonical serial=355/355
unit files=59
skipped=0
architecture=26 packages / 64 edges / 114 sources
exports=26/26
package manifest=965/965 changed=0
```

## Deterministic package proof

Two independent executions of `scripts/package_step014a.py` over the same source produced byte-identical ZIP files. The ZIP contains one top-level `openrill/` directory and 966 source files. Excluded runtime directories are `.git`, `node_modules`, `dist`, `.artifacts`, and `__pycache__`.

## Fresh-ZIP proof

The sealed ZIP was extracted into a new root. Twenty-six `@openrill` workspace links and the Node type link were materialized against that new root; no link pointed to the source worktree.

The fresh root passed:

```text
package manifest=965/965 changed=0
workspace links=64 edges / 26 materialized
source/version=27 manifests / 26 sources / 3 Host literals
lock=27 importers / 67 dependencies
build=PASS
focused=25/25
canonical=355/355
architecture=26/64/114
exports=26/26
aggregate=102/102 PASS
```

## Scope of the result

This is deterministic foundation acceptance. STEP014A adds no public delegation Tool, protocol operation, Control UI child surface, Browser process, external model call, or connector call. It therefore does not claim delegated child execution or Windows autonomous delegated work.
