# STEP014A canonical test file enumeration

## Issue

The first STEP014A runner encoded the canonical command argument as the literal string `tests/unit/*.test.mjs`.

`subprocess` and the shared stage runner do not invoke a shell, so wildcard expansion is not an operating-system-independent contract. A literal wildcard may be passed to Node and reject a valid source tree.

## Root cause

The command copied shell syntax into a direct process argument list.

## Correction

The runner resolves and sorts the complete `tests/unit/*.test.mjs` inventory with `pathlib` before constructing the Node command. Every test file is passed as a separate argument.

## Recurrence gate

`delegation-boundaries-step014a.test.mjs` requires:

- a derived `UNIT_TEST_FILES` inventory;
- sorted explicit file arguments in the canonical command;
- no wildcard literal inside the canonical stage command.
