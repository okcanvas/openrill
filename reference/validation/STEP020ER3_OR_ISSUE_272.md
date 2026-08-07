# OR-ISSUE-272 — Windows `python -c` validator import-path assumption

| Field | Value |
|---|---|
| First observed | Actual STEP020ER2 Windows LIVE acceptance |
| Symptom | aggregate 54/57 FAILED; focused 14/16; Live Harness 20/23 FAILED |
| Direct error | `ModuleNotFoundError: No module named 'scripts.step020er2_live_marker'` |
| Classification | Acceptance validator process entrypoint / Windows path portability |
| Direct cause | Node test used `python -c` plus package-style import and assumed cwd/PYTHONPATH semantics |
| Product impact | None; retry, completion, controller wake, restart and migration scenarios passed |
| Correction | invoke an absolute validator `.py` file with `--validate-stdin`; derive paths with `fileURLToPath`; verify from external cwd and with a shadow `scripts` package |
| Recurrence gate | dedicated Python verifier, Node external-cwd tests, focused/canonical/Windows Harness inclusion |

The correction does not add `PYTHONPATH`, does not add sleep, and does not rely on `scripts/__init__.py`. The validator resolves its contract from `Path(__file__)`, so caller cwd is irrelevant.
