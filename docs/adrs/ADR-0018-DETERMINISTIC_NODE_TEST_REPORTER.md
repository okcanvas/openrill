# ADR-0018 — Deterministic Node Test Reporter

- Status: Accepted
- Date: 2026-08-01
- Step: STEP003A

## Context

Node's default test reporter is selected by runtime and output context. Windows Node 24 printed successful totals as `ℹ tests 29`, while STEP003 acceptance required the TAP-formatted text `# tests 29`. All tests and the suite process succeeded, but acceptance produced a false negative.

The suite also enabled `shell: true` on Windows even though command and arguments were already structured separately, producing Node `DEP0190` warnings.

## Decision

- Invoke Node tests with `--test-reporter=tap`.
- Treat TAP totals and the OpenRill-owned suite marker as the stable acceptance contract.
- Run all child commands with `shell: false`.
- Fail closed when `spawnSync` itself returns an error.
- Disable color and force UTF-8 for child Python processes.

## Consequences

- Windows and Unix acceptance observe the same test summary grammar.
- TTY, glyph and color selection cannot create false failures.
- Command arguments are not re-concatenated through a shell.
- Suite output remains human-readable and machine-verifiable.
