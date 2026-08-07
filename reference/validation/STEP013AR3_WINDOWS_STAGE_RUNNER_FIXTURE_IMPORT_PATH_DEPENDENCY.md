# OR-ISSUE-089 — STEP013AR3 Windows stage-runner fixture import-path dependency

## Exact command and symptom

```cmd
pnpm acceptance:step013ar3
```

Windows reached the new visible stages. `focused-acceptance-stage-runner` failed, and the full canonical suite failed the same subtest:

```text
ModuleNotFoundError: No module named 'scripts.acceptance_stage_runner'

focused stage runner: 3/4
canonical suite: 261/262
STEP013AR3: 178/180 FAILED
```

The failing source location was `tests/unit/acceptance-stage-runner-step013ar3.test.mjs`, subtest `acceptance stage runner bounds a non-terminating child and reports timeout evidence`.

## Evidence boundary

The log proves that the spawned Windows Python process did not resolve the repository `scripts` namespace. It does not record the complete Python `sys.path`, launcher implementation, or any `PYTHONSAFEPATH` setting, so the environment-specific reason that the current root was absent must not be guessed.

## Root cause

### Code-confirmed

The fixture executed Python through `python -c` and imported the helper with:

```python
from scripts.acceptance_stage_runner import run_stage
```

This made a recurrence-prevention test depend on the repository root being implicitly present on Python's import path. The helper identity was already known by an exact repository file location, but the fixture did not use it. The actual aggregate imported the sibling helper from its script directory and had already emitted working START/END/HEARTBEAT markers; the failure was isolated to the fixture import bootstrap.

## Impact

- the timeout/process-tree contract was not validated on Windows;
- the focused gate failed;
- the same test failed again inside the canonical suite;
- STEP013AR3 could not be accepted even though preceding visible stages completed;
- the stage runner implementation itself was not proven defective by this evidence.

## Fix

The fixture now:

1. resolves `scripts/acceptance_stage_runner.py` to an explicit absolute file;
2. loads it with `importlib.util.spec_from_file_location`;
3. registers the module in `sys.modules` before execution so dataclass/module metadata is stable;
4. runs from an unrelated temporary working directory;
5. enables `-P` and `PYTHONSAFEPATH=1` in the fixture so success cannot depend on implicit cwd/PYTHONPATH insertion;
6. retains the real 30-second child with a 0.4-second stage timeout and verifies timeout evidence.

## Recurrence-prevention gates

- dynamic timeout fixture succeeds from an unrelated cwd with safe-path isolation;
- static gate rejects `from scripts.acceptance_stage_runner import run_stage` in the fixture;
- static gate requires explicit file identity, `sys.modules` registration, and loader execution;
- focused retained stage-runner tests and STEP013AR4 import-boundary tests both pass;
- the full serial canonical suite passes with skipped 0;
- current/fresh package reports and deterministic ZIP remain byte-identical.

## Closure

This issue closes only after the STEP013AR4 Windows final marker passes. The immutable accepted baseline remains STEP012DR4 until then.
