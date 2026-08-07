# OR-ISSUE-236 — Local Protocol capability contract omitted the new Task operations

## Observation

The first full canonical run failed `tests/unit/local-protocol-step004.test.mjs` while the Host handshake correctly advertised `task.cancel`, `task.get`, and `task.list`.

## Direct cause

STEP020A registered the new closed Task operations in the production operation registry, but the retained exact capability-list integration test still described the pre-STEP020A protocol surface.

## Correction

- Add `task.cancel`, `task.get`, and `task.list` to the exact sorted handshake capability contract.
- Retain focused Task protocol behavior tests for validation and error mapping.
- Keep the broad Local Protocol handshake test in canonical so any future public operation addition requires an explicit contract update.

## Recurrence proof

`tests/unit/local-protocol-step004.test.mjs` now expects the three Task operations, while `tests/unit/background-task-protocol-step020a.test.mjs` proves their closed input/output behavior.
