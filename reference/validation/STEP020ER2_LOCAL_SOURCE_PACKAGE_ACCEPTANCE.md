# STEP020ER2 local source/package acceptance

```text
step=STEP020ER2_WINDOWS_COMPLETION_LIVE_MARKER_CONTRACT_ALIGNMENT
version=0.20.7-step020er2
schema=22
checks=56/56
state=PASSED
focused_product=16/16
affected_regression=99/99
governance=168/168
canonical_files=149
canonical_tests=783/783
canonical_skipped=0
manifest=1560/1560
architecture=36 packages / 93 edges / 163 sources
exports=36/36
automated_run_seconds=68.940
source_package=ACCEPTED
windows_completion_marker_live=PENDING_ENV
promotion=WINDOWS_COMPLETION_MARKER_LIVE_PENDING
```

The marker alignment is acceptance-only. Completion delivery, required completion semantics, bounded Local Protocol retry, schema 22, controller wake and Host restart behavior are unchanged from STEP020ER1. The actual STEP020ER1 Windows Product Harness passed 21/21; only its aggregate marker contract failed.
