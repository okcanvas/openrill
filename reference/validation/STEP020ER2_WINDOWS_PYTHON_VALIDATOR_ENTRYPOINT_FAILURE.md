# STEP020ER2 Windows Python validator entrypoint failure

```text
command=pnpm acceptance:step020er2:live
aggregate=54/57 FAILED
focused_product=14/16
canonical=FAILED
windows_live=20/23 FAILED
promotion=BLOCKED
```

The actual Windows run preserved the Product path: Local Protocol bounded retry, completion delivery, required completion semantics, controller wake, queued wake Host restart, and schema-22 backfill all passed. The failure was isolated to two tests in `tests/unit/live-marker-contract-step020er2.test.mjs`.

```text
ModuleNotFoundError: No module named 'scripts.step020er2_live_marker'
```

The test launched `python -c` and imported `scripts.step020er2_live_marker`, relying on the caller working directory becoming a Python import root. That was not a valid cross-platform contract. The same failure repeated in focused Product, canonical, and Windows LIVE because the same test file was executed in all three stages.

The structured aggregate validator correctly rejected the inner marker as `checks=20/23 state=FAILED`; this was not the prior whole-marker mismatch. Product behavior must not be changed to repair this validator process-entry failure.
