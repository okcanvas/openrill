# STEP022B Local Source Package Acceptance

```text
STEP=STEP022B_DURABLE_CONNECTOR_RUNTIME_INGRESS_DELIVERY_AND_BINDING
VERSION=0.23.0-step022b
STATE_SCHEMA=25
MODE=LOCAL_STAGED_EXACT_ACCEPTANCE
CHECKS=32/32 PASSED
WINDOWS_CONNECTOR_RUNTIME_LIVE=PENDING_ENV
PROMOTION=WINDOWS_CONNECTOR_RUNTIME_LIVE_PENDING
OFFICIAL_PRODUCT_BASELINE=STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE
```

## Executed evidence

```text
focused_connector=21/21
retained_step022a_step021br2=40/40
affected_config_protocol_host=23/23
governance=230/230
canonical_files=173
canonical_tests=910/910
canonical_failed=0
canonical_skipped=0
architecture=37 packages / 99 edges / 179 sources
exports=37/37
workspace_lock=38 importers / 102 dependencies
workspace_module_links=99 edges / 37 materialized
```

The canonical runner was executed over the exact sorted 173-file list in six deterministic contiguous groups because the tool environment terminates a single long parent command. The groups contained 30, 30, 30, 30, 30 and 23 files and produced 153, 184, 104, 147, 169 and 153 tests. Concatenated group paths equal the canonical sorted list exactly: missing 0, extra 0, duplicate 0, order exact.

The unmodified `scripts/run_step022b_acceptance.py` retains the single aggregate canonical stage for normal and Windows execution. No acceptance condition was removed. Fresh source ZIP verification must run source-only checks before install/build and build-dependent exports after `pnpm install --frozen-lockfile` plus workspace build.
