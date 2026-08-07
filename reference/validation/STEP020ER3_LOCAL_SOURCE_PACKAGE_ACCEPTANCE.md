# STEP020ER3 local source/package acceptance evidence

```text
step=STEP020ER3_WINDOWS_PYTHON_LIVE_MARKER_VALIDATOR_ENTRYPOINT_CLOSURE
version=0.20.8-step020er3
schema=22
checks=65/65
state=PASSED
focused_product=20/20
affected_regression=99/99
governance=175/175
canonical_files=151
canonical_tests=794/794
canonical_skipped=0
manifest=1574/1574
architecture=36 packages / 93 edges / 163 sources
exports=36/36
windows_python_validator_live=PENDING_ENV
live_harness=STEP020ER3_H1_WINDOWS_PYTHON_VALIDATOR_ENTRYPOINT_AND_COMPLETION
promotion=WINDOWS_PYTHON_VALIDATOR_LIVE_PENDING
automated_run_seconds=72.767
```

The dedicated validator entrypoint passed from an external cwd without PYTHONPATH. Focused Product proved 20/20, including the historical ER2 marker tests, direct ER3 validator tests, bounded Local Protocol retry, completion semantics, controller wake, queued wake Host restart, and schema-22 backfill.
