# STEP003 Windows Default Reporter Failure

## Environment

- Windows
- Node.js `24.18.0`
- pnpm `11.15.1`
- command: `pnpm acceptance:step003`

## Observed result

The build, unit tests, architecture checks and exports completed successfully. Node reported:

```text
ℹ tests 29
ℹ pass 29
ℹ fail 0
```

The suite also emitted `OPENRILL_STEP001_SUITE_PASS`, but `run_step003_acceptance.py` required the platform-specific text `# tests 29`. The single acceptance item `build-unit-architecture-exports` therefore failed and STEP003 ended at `140/141`.

## Code cause

`scripts/run-step001-suite.mjs` invoked `node --test` without selecting a reporter. Node selected a default reporter based on runtime/platform output behavior. The acceptance runner treated one default reporter's presentation text as a product contract.

## Resolution

STEP003A selects the TAP reporter explicitly with `--test-reporter=tap`, disables shell command concatenation, and requires a deterministic suite marker plus TAP totals.
