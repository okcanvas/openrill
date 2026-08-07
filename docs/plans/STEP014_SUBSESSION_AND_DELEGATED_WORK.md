# STEP014 — SUBSESSION_AND_DELEGATED_WORK

STEP014 is split because durable graph ownership, public Tools, nested scheduling, recovery, Protocol, UI, and Windows live validation cannot safely be introduced in one schema-and-runtime wave.

## STEP014A — foundation

`STEP014A_DURABLE_DELEGATION_GRAPH_BUDGET_ENVELOPE_AND_WAIT_STATE_FOUNDATION`

- schema 12
- durable graph and append-only events
- total token/time/depth/child budget envelope
- monotonic workspace/skill/Tool scope
- `WAITING_DELEGATION` projection and restart classification
- transition/cancellation ordering foundation
- no public delegation Tool

## STEP014B — single child

`STEP014B_SINGLE_CHILD_DELEGATED_EXECUTION_AND_DURABLE_PARENT_RESUME`

- `agent.spawn`
- `agent.wait`
- one active child, depth 1 default
- non-blocking spawn
- durable wait/result insertion
- parent resume with bounded summary, Artifact references, usage, typed error

## STEP014C — nested and recovery

`STEP014C_BOUNDED_NESTED_DELEGATION_PARALLELISM_AND_RESTART_RECOVERY`

- bounded nesting and fan-out
- reservation/release
- timeout and cancellation cascade
- exact-once terminal result delivery
- Host restart while parent waits or child finishes

## STEP014D — product surface

`STEP014D_DELEGATED_WORK_CONTROL_UI_AND_WINDOWS_VERTICAL_SLICE`

- delegation list/get/cancel Protocol operations
- parent/child Run tree in Control UI
- Windows two-child research vertical slice
- final process/Browser residue zero

## Global invariants

- child never widens parent workspace, Skill, Tool, approval, or Secret scope;
- raw child reasoning and unbounded transcript never become parent result;
- child failure does not automatically fail the parent;
- parent cancellation is deepest-first;
- no detached child in STEP014;
- no distributed worker in STEP014.
