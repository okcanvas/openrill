# STEP020ER1 Local Source/Package Acceptance

```text
step=STEP020ER1_WINDOWS_LOCAL_PROTOCOL_RESTART_CONNECT_RETRY_CLOSURE
version=0.20.6-step020er1
schema=22
checks=59/59
state=PASSED
focused_product=13/13
affected_regression=99/99
governance=161/161
canonical_files=147
canonical_tests=773/773
canonical_skipped=0
manifest=1547/1547
architecture=36 packages / 93 edges / 163 sources
exports=36/36
automated_run_seconds=63.940
promotion=WINDOWS_COMPLETION_RETRY_LIVE_PENDING
accepted_product_baseline=STEP020D_TASK_AND_TASK_FLOW_RECONCILIATION_LOST_AND_RETENTION_FOUNDATION
```

The correction preserves the full STEP020E schema-22 completion-delivery implementation and adds bounded transport-only Local CLI protocol retry. The caller owns one total timeout. Authentication, protocol, remote-bind, and Host identity failures remain fail-fast.

The actual STEP020E Windows failure is retained in `STEP020E_WINDOWS_COMPLETION_LIVE_FAILURE.md`. This source/package result does not promote STEP020ER1; Windows must run the H1 Harness.
