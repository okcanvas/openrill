# STEP016AR1 Local Source/Package Acceptance

```text
step=STEP016AR1_WINDOWS_DPAPI_ENCODED_COMMAND_ARGUMENT_TRANSPORT_ALIGNMENT
version=0.16.1-step016ar1
schema=15
source_package_acceptance=68/68 PASS
automated_run_seconds=68.746
focused_product=11/11 PASS
affected_cli_config=8/8 PASS
governance=32/32 PASS
canonical=94 files / 528/528 PASS / skipped=0
source_version=29/28/3 PASS
workspace_lock=29/76 PASS
workspace_links=73/28 PASS
architecture=28/73/123 PASS
exports=28/28 PASS
browser=NOT_RUN
model_network=NOT_RUN
windows_dpapi_live=PENDING_ENV
promotion=WINDOWS_DPAPI_LIVE_PENDING
```

The first Windows STEP016A failure is retained as OR-ISSUE-206. This corrective candidate changes
only the Windows PowerShell transport used by the DPAPI provider and its non-secret diagnostics.
