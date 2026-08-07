# STEP020ER3 — Windows Python LIVE marker validator entrypoint closure

## Objective

Close the actual STEP020ER2 Windows failure without changing Product completion, retry, Task, Flow, Run, Host, or schema behavior.

## Code-grounded failure

`tests/unit/live-marker-contract-step020er2.test.mjs` launched `python -c` and imported `scripts.step020er2_live_marker`. Windows returned `ModuleNotFoundError`; focused Product failed 14/16, canonical stopped at that file, and the Live Harness correctly emitted 20/23 FAILED.

## Correction

1. Make the Python marker validator an explicit CLI with `--validate-stdin`.
2. Invoke the validator by absolute file path, calculated with Node `fileURLToPath`.
3. Never depend on cwd, namespace-package discovery, or `PYTHONPATH`.
4. Prove operation from an external cwd containing spaces.
5. Prove a caller-local shadow `scripts` package cannot intercept execution.
6. Preserve the structured marker field-set contract and all STEP020E/ER1 Product semantics.

## Explicit non-goals

No Product lifecycle changes, no State migration, no retry-policy change, no Plan executor, no Browser LIVE, and no real Connector claim.
