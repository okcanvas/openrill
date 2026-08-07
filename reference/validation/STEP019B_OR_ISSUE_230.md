# OR-ISSUE-230 — Graceful Host shutdown was indistinguishable from operator cancellation

## Observation

Before STEP019B, `AgentRunCoordinator.close()` aborted active Run controllers with the same untyped abort used by `conversation.cancel`. Agent Kernel therefore transitioned a checkpointed detached Run to terminal `CANCELLED` during normal Host shutdown.

## Direct cause

The execution boundary carried no explicit Host-shutdown reason and the Kernel had no interruption result distinct from user cancellation.

## Correction

- Add the closed abort reason `OPENRILL_AGENT_HOST_SHUTDOWN`.
- Map it to `AGENT_HOST_SHUTDOWN`, never `AGENT_CANCELLED`.
- Classify a checkpointed active Run as `CREATED/RESUMABLE` and an uncheckpointed active Run as `FAILED/NON_RESUMABLE`.
- Return non-terminal execution status `INTERRUPTED` only for the resumable shutdown path.
- Preserve plain abort as terminal operator cancellation.

## Recurrence proof

`tests/unit/detached-run-resume-step019b.test.mjs` proves both branches and verifies Tool side effects remain exactly once after resume.
