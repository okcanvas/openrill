# STEP014B — Single-child delegated execution and durable parent resume

## Identity

```text
STEP014B_SINGLE_CHILD_DELEGATED_EXECUTION_AND_DURABLE_PARENT_RESUME
version=0.14.1-step014b
schema=13
baseline=STEP013CR2
retained_foundation=STEP014A
```

## Goal
Expose two small closed Tools on the STEP014A graph and budget foundation:

```text
agent.spawn
agent.wait
```

A parent creates at most one active depth-1 child. Spawn is non-blocking. Wait either returns an already-terminal bounded result or durably pauses the parent. Child completion delivers one Tool result/checkpoint and resumes the same parent Run as a new attempt.

## Owned implementation
- `packages/tools-delegation/`
- migration 013 result-delivery ledger
- Kernel durable budget selection and Tool-scope enforcement
- Host child scheduling, terminal delivery, parent resume and child Skill isolation
- bounded child summary, Artifact references, usage and typed error

## Invariants
- child workspace/Tool/Skill/budget scope never widens;
- raw task is stored only in child Conversation, not delegation ledger/output;
- raw transcript and reasoning never enter the parent result;
- delivery is idempotent and exactly once;
- child failure is evidence returned to the parent, not automatic parent failure;
- no detached, nested, parallel, Protocol, UI, or distributed child execution.

## Acceptance flow
```text
parent Run
→ agent.spawn
→ child Run scheduled
→ agent.wait
→ parent attempt ABORTED/DELEGATION_WAIT
→ parent Run CREATED/RESUMABLE + WAITING_DELEGATION projection
→ child terminal
→ one agent.wait Tool result + checkpoint
→ wait cleared
→ parent attempt 2
→ parent completed
```

## Clean build graph closure

OR-ISSUE-136 records that `packages/tools-delegation` must be an ordered root TypeScript project reference before Host. STEP014B acceptance removes all `dist` outputs before building, preventing stale-output false passes.
