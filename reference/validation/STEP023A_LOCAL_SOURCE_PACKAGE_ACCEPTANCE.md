# STEP023A Local Source Package Acceptance

```text
STEP=STEP023A_PERIODIC_MAINTENANCE_PHYSICAL_RETENTION_AND_PRUNE
VERSION=0.25.0-step023a
SCHEMA=26
STATE=LOCAL_SOURCE_ACCEPTED
LOCAL_ACCEPTANCE=32/32 PASSED
OFFICIAL_PRODUCT_BASELINE=STEP021BR2_WINDOWS_TAP_SUMMARY_PARSER_CLOSURE
MATTERMOST_CONNECTOR=PREPARING_LIVE_PENDING_NON_BLOCKING
WINDOWS_MAINTENANCE_RETENTION_LIVE=PENDING
PROMOTION=WINDOWS_MAINTENANCE_RETENTION_LIVE_PENDING
```

## Final recorded source-state evidence

```text
focused_maintenance=17/17
retained_durable_state=60/60
affected_regression=23/23
governance=252/252
canonical_files=188
canonical_tests=987/987
canonical_failed=0
canonical_skipped=0
canonical_expected_files=188
canonical_executed_files=188
canonical_unique_files=188
canonical_order_exact=true
canonical_missing=0
canonical_extra=0
architecture=37 packages / 99 edges / 189 sources
exports=37/37
workspace_lock=38 importers / 102 dependencies
workspace_module_links=99 edges / 37 materialized
project_tree_entries=2006
manifest_files=1882/1882
issues=OR-ISSUE-376..404
```

The canonical inventory was executed through the unchanged `scripts/run-canonical-unit-batches.mjs` against the exact sorted 188-file inventory. Deterministic contiguous groups were used to stay within the execution-tool call window; the executed file sequence was reconciled exactly against the complete canonical inventory with zero missing, extra, or duplicate files.

STEP023A adds no second executor. Periodic retention owns retention scheduling, a durable cross-Host lease, a persisted sweep cursor, dependency re-checks, tombstone-before-delete, bounded pruning, and closed Local Protocol preview/prune/tombstone operations. Active or unresolved Task/Flow/Goal/completion/Connector state is protected. Ambiguous Connector deliveries are never automatically pruned. Mattermost STEP022C remains `PREPARING/LIVE_PENDING` and is explicitly non-blocking.

Windows promotion remains pending. The required command on a Fresh Windows source tree is:

```text
pnpm install --frozen-lockfile
pnpm acceptance:step023a:live
```

Expected focused live harness: `STEP023A_H1_PERIODIC_RETENTION_LEASE_CURSOR_PRUNE_AND_RESTART`, `28/28`. The official Product baseline remains STEP021BR2 until the Windows promotion gate passes.
## STEP023AR1 GitHub publication corrective note

A later source-transport corrective, `STEP023AR1_GITHUB_PUBLISHING_SOURCE_HYGIENE_AND_EOL_CONTRACT_CLOSURE`, adds no Product runtime changes. It adds repository-owned EOL/secret-ignore policy and GitHub publication documentation while preserving STEP023A version `0.25.0-step023a`, schema 26, and the Windows maintenance-retention Live pending state. See `GITHUB_PUBLISHING.md` and `reference/validation/STEP023AR1_GITHUB_PUBLISHING_READINESS_AUDIT.md`.

